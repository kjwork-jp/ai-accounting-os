# WBS 3.1 証憑取込 実装完了レビュー（テスト・評価）

- レビュー日: 2026-02-19
- 対象: WBS 3.1.1〜3.1.6（証憑アップロード / OCR非同期処理 / 構造化 / 分類 / 重複検知 / 失敗リトライ）
- 根拠: `Claude_Code_Document/WBS.xlsx`（XML抽出で 3.1 系タスク確認）、`docs/*`、`src/*`、`worker/*`

## 1. 実施方法（網羅性）

1. ドキュメント確認
   - `docs/` 全 Markdown を確認。
   - `Claude_Code_Document/` は docx/xlsx を XML 展開して 3.1/OCR/証憑関連行を抽出確認（WBS, 要件定義書, メイン統一手順書, 鍵管理台帳など）。
2. 実装確認
   - API (`/api/v1/documents/*`)、Worker (`worker/src/jobs/*`)、UI (`src/components/documents/*`)、バリデータ (`src/lib/validators/documents.ts`) をレビュー。
3. 検証実行
   - 4点チェック（lint → typecheck → test → build）を実行。

## 2. 総合評価

- **判定: 条件付きで「実装完了」**
  - OCR 非同期パイプライン（enqueue → queued/processing → extracted/error）は概ね成立。
  - 一方で、**API 認可境界の不足** と **状態遷移の競合時の安全性** に P1 リスクが残る。

## 3. 要件適合レビュー（WBS 3.1 対応）

### 3.1.1 証憑アップロード UI
- 実装あり。D&D、複数ファイル選択、進捗ステータス表示、`auto_parse=true` 送信を確認。

### 3.1.2 Azure DI + 非同期 Worker
- 実装あり。BullMQ Worker、DI 呼び出し、ポーリング、429/5xx backoff、`retry-after` 尊重を確認。
- DI 制約（15TPS）は Worker limiter (`max: 15/duration:1000`) で制御。

### 3.1.3 抽出データ構造化
- 実装あり。`structureExtraction` で帳票項目を統一 JSON に整形し `document_extractions.extracted_json` に保存。

### 3.1.4 文書自動分類
- 実装あり。ルール分類 + LLM フォールバック。OCR対象種別を `invoice/receipt/quotation/contract/other` に制限。

### 3.1.5 重複証憑検知
- 実装あり。`document_date ±3日` + `amount一致` の近似候補検知。
- 保存先は `document_extractions.extracted_json.duplicate_suspects` で統一されている。

### 3.1.6 失敗リトライ UI
- 実装あり。`/api/v1/documents/:id/retry` と UI ボタン導線あり。

## 4. 主要指摘（重大度つき）

## High

1. **documents 系 API で RBAC の強制が不十分**
   - `GET /api/v1/documents`, `GET /api/v1/documents/:id`, `GET /api/v1/documents/:id/status`, `POST /api/v1/documents/upload` が `requireAuth` のみで、`requireRole` による `documents:view/upload` チェックがない。
   - コメント上は「Requires documents:view」と記載があるため、コードと仕様が不整合。

2. **enqueue/retry の楽観更新で「更新件数 0 件」を検知していない**
   - `enqueue-parse` / `retry` ともに `.update(...).eq(...).in(...)` 実行後、`error` のみを確認して続行している。
   - 競合により更新 0 件でもジョブ投入が進行しうるため、状態遷移契約（status gate）が崩れる可能性がある。

## Medium

3. **SLO 値がレビュー/計画資料と実装で乖離**
   - 実装 `SLO.OCR_JOB_LATENCY_P95_MS=120_000`, `OCR_SUCCESS_RATE_DAILY=0.95`。
   - 計画/レビュー文書側には 240秒/99% 相当の記述があり、運用KPI定義が統一されていない。

4. **OCR自動enqueue失敗時の可観測性不足**
   - upload API の `auto_parse` 失敗時は catch で握りつぶし（ユーザーには成功で返却）。
   - MVPとして許容可能だが、運用上は warning ログや `status` 補助情報が必要。

## 5. 保守性・効率性レビュー

- 良い点
  - `src/lib/validators/documents.ts` に型・状態の単一ソースを集約。
  - Worker は責務分離され、`classification` / `duplicate-check` / `metrics` が単機能化。
  - 失敗系を non-fatal と fatal で明確に分離。
- 改善点
  - `src/lib/di/client.ts` と `worker/src/lib/di-client.ts` にほぼ同一ロジックの重複がある（将来差分バグ要因）。

## 6. ドキュメント整合性レビュー

1. `docs/plan-wbs3.1-receipt-ocr.md` は「計画書」の前提で、実装済み状態との差分が残っている。
2. `docs/review-wbs3.1-receipt-ocr.md` は開発前レビュー（B+）であり、実装完了判定資料としては更新が必要。
3. 本ドキュメント（本ファイル）を実装完了時点の評価レビューとして採用することを推奨。

## 7. 追加テスト観点（次アクション）

- API認可テスト
  - `viewer` で upload/retry できないこと。
  - `documents:view` 非保有で list/detail/status が拒否されること。
- 競合テスト
  - 同一 document に対する enqueue/retry 同時実行時、1件のみ queued になること。
- E2E
  - upload → queued → processing → extracted の UI ポーリング遷移確認。

## 8. 結論

- WBS 3.1 の主要機能は稼働する状態にあり、**機能実装としては完了に近い**。
- ただし、運用投入前に以下2点を必須修正とすることを推奨。
  1. documents 系 API の RBAC 強制を仕様どおり実装。
  2. enqueue/retry で「更新件数0件」の競合を検知して 409 を返す。

---

## 9. 再レビュー結果（修正反映後）

- 再レビュー日: 2026-02-19
- 結論: **主要指摘は一部未解消。実装は稼働可能だが、運用投入前の是正が必要**

### 再確認した範囲

1. `Claude_Code_Document/`（docx/xlsx）を XML 展開し、WBS 3.1・証憑取込・OCR・DI制約関連を再抽出
2. `docs/` 全 Markdown を再確認
3. `src/app/api/v1/documents/*`、`src/components/documents/*`、`worker/src/*` を再確認
4. 4点チェック（lint → typecheck → test → build）を再実行

### 未解消（継続）

1. **documents 系 API の RBAC 強制不足（High）**
   - `GET /api/v1/documents`, `GET /api/v1/documents/:id`, `GET /api/v1/documents/:id/status`, `POST /api/v1/documents/upload` は `requireAuth` のみで、`requireRole` によるアクセス制御が未実装。

2. **enqueue/retry の競合時ガード不足（High）**
   - `.update(...)` 後に「更新件数0件（同時更新で取りこぼし）」を判定しておらず、競合時にジョブ投入を継続する可能性が残る。

### 改善を確認した点

- 4点チェックは再レビュー時点で全て成功。
- 文書分類・重複検知・メトリクス・retry導線は実装として一貫して動作する設計を維持。

### 追加推奨（再掲）

1. `documents:view` / `documents:upload` の permission string を API レベルで強制。
2. enqueue/retry の status 更新を `select('id').single()` 付き更新にし、0件更新時は `409 conflict` を返却。
3. upload API の auto-parse enqueue 失敗時に warning ログと返却メタ情報（`enqueued:false` など）を付与。
