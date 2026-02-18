# WBS 3.1 証憑取込・OCR 開発プラン 評価レビュー

レビュー対象: `docs/plan-wbs3.1-receipt-ocr.md`

## 総合評価

- **評価: B+（実装可能性は高いが、運用・整合性の詰めが必要）**
- 良い点は、WBSごとに作業分解されており、API/Worker/UIまで一気通貫で計画されていること。
- 一方で、**データモデル整合性、状態遷移の責務分離、観測性（SLO/メトリクス）** が不足しており、実装フェーズで手戻りのリスクがある。

---

## 良い点（このまま活かせる）

1. **既存資産の再利用範囲が明確**
   - Upload API、RBAC、監査ログ、DB型、Storageまで事前棚卸しできている。
2. **非同期アーキテクチャが要件に適合**
   - APIでenqueue、WorkerでOCR/分類/保存、UIでポーリングという責務分離ができている。
3. **安全柵の意識が高い**
   - DIのレート制限、backoff、DLQ、10MB制限、tenant分離が計画に含まれている。
4. **テスト項目が機能分解に対応**
   - 構造化・分類・重複検知・API認可まで、単体/結合テスト対象が整理されている。

---

## 主要な懸念点（優先度順）

### P0: ドキュメント型の不整合リスク

- 分類結果に `bank_statement` / `credit_card` を含めているが、他所では `invoice | receipt | quotation | contract | other` に限定している。
- この状態だと、APIのZodバリデーション、DB enum、UIフィルタが不一致になる可能性が高い。

**推奨対応**
- `DocumentTypeCode` を先に単一ソース（DB enum + TS union + Zod）で確定。
- Step 4の分類仕様とStep 6のAPI仕様を同じ列挙値に統一。

### P0: `status` 更新責務がAPIとWorkerで競合

- enqueue APIで `processing` に更新し、Worker開始時にも `processing` 更新する設計になっている。
- 同一文書に対する重複実行時に、状態遷移の競合や監査ログ重複が起きやすい。

**推奨対応**
- 状態遷移を以下に固定:
  - API: `uploaded/error -> queued` のみ
  - Worker開始: `queued -> processing`
  - Worker完了: `processing -> extracted/error`
- `WHERE status IN (...)` を使った楽観的更新で競合回避。

### P0: 重複検知の保存先が曖昧

- `duplicate_suspect_ids` を `documents` に持つ案と `document_extractions.extracted_json` に入れる案が併記されている。
- このままだと、検索性能・UI取得API・将来監査の実装方針が定まらない。

**推奨対応**
- MVPでは `document_extractions.extracted_json.duplicate_suspects` に統一（スキーマ変更回避）。
- Phase 2で必要なら正規化テーブルへ昇格。

### P1: 監査ログ項目がプロジェクト規約とズレる恐れ

- `enqueue_parse` / `retry_parse` という action 名を提案しているが、既存規約の代表値（create/update/delete/disable）との整合が未確認。

**推奨対応**
- 監査ログ action は既存許容値を確認し、必要なら `update` + `diff_json` で表現。
- どうしてもイベント名を増やす場合は、監査ログ仕様に明示追加。

### P1: OCRモデル固定による分類/抽出品質の偏り

- `prebuilt-invoice` 前提で全帳票処理するため、請求書以外で抽出失敗や低信頼が増える可能性。

**推奨対応**
- 初期判定で `read` / `layout` / `prebuilt-invoice` を切り替える戦略を準備。
- 少なくとも信頼度閾値未満時のフォールバックルートを定義。

### P1: 可観測性・運用指標の不足

- 失敗時DLQはあるが、運用KPI（処理時間、成功率、リトライ率、キュー滞留）とアラート基準が未定義。

**推奨対応**
- 最低限のメトリクスを先に定義:
  - `ocr_job_latency_ms`（P95）
  - `ocr_success_rate`（日次）
  - `ocr_retry_count`
  - `queue_depth_heavy`
- SLO案: P95 240秒以内、成功率99%以上。

### P2: 工数18hに対する範囲過大

- Worker新設、API複数、UI一覧+詳細、分類/構造化/重複検知、テストまで含めると18hは厳しい。

**推奨対応**
- S2 Phase 1は「Upload→OCR→抽出表示」までに限定。
- 重複近似検知、詳細UI高度化、再アップロード導線はPhase 1.5へ分離。

---

## 実装前に確定すべき決定事項（チェックリスト）

- [ ] `DocumentTypeCode` の正規値セット（DB/TS/Zod/UI共通）
- [ ] `DocumentStatus` の遷移図（queued追加有無含む）
- [ ] 重複疑いデータの保存場所（JSONB or 正規化）
- [ ] 監査ログ action 命名の正規ルール
- [ ] Worker失敗時の `error_message` 正規化仕様（ユーザー表示文面と内部ログの分離）
- [ ] SLO/KPI とアラート閾値

---

## 推奨マイルストーン（再計画案）

### M1（最短価値）
- enqueue API
- WorkerでDI実行
- 構造化データ保存
- 一覧で `uploaded/processing/extracted/error` 表示

### M2（業務実用）
- 分類ロジック（ルール + LLMフォールバック）
- 詳細ページ（抽出結果表示）
- retry API + UI

### M3（品質向上）
- 近似重複検知
- 運用メトリクス・アラート
- E2Eと失敗系テスト拡充

---

## 最終コメント

このプランは、方向性・分解粒度ともに良く、着手可能なレベルに達しています。
ただし、**型/状態/監査の契約（contract）を先に固定**しないと、後半で API・Worker・UI の三重手戻りが発生しやすいです。

最初に「列挙値と状態遷移の統一仕様」を1ページで確定してから実装に入ることを推奨します。
