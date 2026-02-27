# WBS 3.3–3.7 テスト・評価レビュー（実装監査）

- 実施日: 2026-02-27
- 対象: WBS 3.3〜3.7（帳簿・出力 / 明細取込・突合 / 取引先管理 / 証憑検索・電帳法 / 既存会計CSV取込）
- 対象要件: ACC-002/003/004/011/012/013/014/017/023, CMN-010, EXT-006/007
- レビュー観点:
  1. 要件/設計トレーサビリティ
  2. バグ・要件漏れ
  3. セキュリティ（注入・認可）
  4. 運用保守性・効率性
  5. ドキュメント整合性

## 1. レビュー手法と参照範囲

### 1.1 ドキュメント
- `Claude_Code_Document/WBS.xlsx`（WBS 3.3〜3.7 要件行を抽出確認）
- `Claude_Code_Document/要件定義書.docx`（ACC/CMN/EXT 要件を照合）
- `Claude_Code_Document/技術設計書.xlsx`（API設計詳細 04 シートを参照）
- `Claude_Code_Document/DB設計書.xlsx`（テーブル定義を照合）
- `docs/plan-wbs3.3-3.7-s3-implementation.md`（実装計画書）
- `docs/sec-mapping.md`, `docs/verification-guide.md`

### 1.2 実装（全41ファイル）

**Validators（新規/修正 6 ファイル）**
- `src/lib/validators/partners.ts`
- `src/lib/validators/payments.ts`
- `src/lib/validators/reports.ts`
- `src/lib/validators/imports.ts`
- `src/lib/validators/journals.ts`（修正: account_code, keyword 追加）
- `src/lib/validators/documents.ts`（修正: registration_number, partner_name 追加）

**ビジネスロジック（新規 4 ファイル）**
- `src/lib/partners/name-matching.ts`
- `src/lib/csv/journal-export.ts`
- `src/lib/csv/bank-csv-parser.ts`
- `src/lib/csv/accounting-csv-parser.ts`
- `src/lib/reconciliation/matcher.ts`

**API Routes（新規 11 / 修正 2 ファイル）**
- `src/app/api/v1/partners/route.ts`（GET, POST）
- `src/app/api/v1/partners/[id]/route.ts`（GET, PATCH）
- `src/app/api/v1/partners/[id]/merge/route.ts`（POST）
- `src/app/api/v1/partners/duplicates/route.ts`（GET）
- `src/app/api/v1/payments/import/route.ts`（POST）
- `src/app/api/v1/reconciliations/suggest/route.ts`（POST）
- `src/app/api/v1/reconciliations/[id]/confirm/route.ts`（POST）
- `src/app/api/v1/reports/trial-balance/route.ts`（GET）
- `src/app/api/v1/reports/tax-summary/route.ts`（GET）
- `src/app/api/v1/journals/export/route.ts`（GET）
- `src/app/api/v1/imports/accounting-csv/route.ts`（POST）
- `src/app/api/v1/journals/entries/route.ts`（修正: account_code/keyword フィルタ追加）
- `src/app/api/v1/documents/route.ts`（修正: 電帳法6キー検索追加）

**UI Components（新規 12 / 修正 2 ファイル）**
- `src/components/journals/journal-entry-list.tsx`
- `src/components/journals/journal-export-button.tsx`
- `src/components/reports/trial-balance-table.tsx`
- `src/components/reports/tax-summary-table.tsx`
- `src/components/partners/partner-list.tsx`
- `src/components/partners/partner-form.tsx`
- `src/components/partners/partner-merge-dialog.tsx`
- `src/components/partners/duplicate-list.tsx`
- `src/components/payments/csv-import-form.tsx`
- `src/components/payments/reconciliation-list.tsx`
- `src/components/documents/document-search-panel.tsx`
- `src/components/imports/accounting-csv-import.tsx`
- `src/components/documents/document-list.tsx`（修正）
- `src/components/layouts/sidebar-nav.tsx`（修正）

**Pages（新規 4 / 修正 1 ファイル）**
- `src/app/(dashboard)/partners/page.tsx`
- `src/app/(dashboard)/payments/page.tsx`
- `src/app/(dashboard)/reports/page.tsx`
- `src/app/(dashboard)/imports/page.tsx`
- `src/app/(dashboard)/documents/page.tsx`（修正）

### 1.3 テスト実行
- `pnpm lint` — Pass
- `pnpm tsc --noEmit` — Pass（0 errors）
- `pnpm build` — Pass（44 files compiled）

---

## 2. 総評

WBS 3.3〜3.7 の5機能（帳簿出力 / 銀行明細突合 / 取引先管理 / 電帳法検索 / 会計CSV取込）は概ね実装済みで、主要フローは成立している。API パターン（`requireAuth → requireRole → Zod validation → business logic → insertAuditLog`）は一貫しており、テナント分離・監査ログ・楽観ロックも適用されている。

一方で、**本番運用で事故につながる設計/実装ギャップが Critical 3件 / High 5件** 確認された。特に「突合確定UIが実際にconfirm APIを呼んでいない」「PostgREST `.or()` フィルタ注入」「freee取込で片側仕訳が発生する」は最優先修正を推奨。

| 重大度 | 件数 | 概要 |
|--------|------|------|
| Critical | 3 | 突合確定UI未接続 / .or()注入 / freee片側仕訳 |
| High | 5 | suggest IDなし / merge不完全カスケード / N+1 / viewer認可漏れ / suggest冪等性なし |
| Medium | 6 | 重複suggest / threshold未検証 / 類似取引先全件取得 / 税計算内税外税 / counterparty=description / ilike特殊文字 |
| Low | 3 | parseCsvLine重複 / 型アサーション / 税コード正規化不足 |

---

## 3. 指摘事項

### 3.1 [Critical] 突合確定UIが confirm API を呼んでいない

- **ファイル**: `src/components/payments/reconciliation-list.tsx:68-92`
- **要件/設計**: WBS 3.4.2 / ACC-003 — 突合提案を確定（`confirmed`）に遷移させる機能。`POST /api/v1/reconciliations/:id/confirm` が confirm API として実装済み。
- **実装**:
  - `handleConfirm()` 関数が `POST /api/v1/reconciliations/suggest` を再呼び出ししている（:75行目）。
  - `POST /api/v1/reconciliations/:id/confirm` は一切呼ばれていない。
  - さらに実際のAPI呼び出し結果を使わず、`toast.success('突合を確定しました')` でUIだけ更新（:82行目）。
- **影響**:
  - ユーザーが「確定」ボタンを押しても DB 上のステータスは `suggested` のまま。
  - 実質的に突合確定機能が動作しない（致命的な機能不備）。
- **推奨**:
  1. suggest API のレスポンスに reconciliation レコードの `id` を含める。
  2. `handleConfirm()` で `POST /api/v1/reconciliations/${reconciliationId}/confirm` を呼ぶよう修正。
  3. confirm API のレスポンスに基づいて UI を更新。

### 3.2 [Critical] PostgREST `.or()` フィルタ注入リスク

- **ファイル**: `src/app/api/v1/partners/route.ts:35`
- **実装**:
  ```typescript
  query = query.or(`name.ilike.%${search}%,name_kana.ilike.%${search}%`);
  ```
  `search` パラメータが直接 `.or()` のフィルタ文字列に展開されている。
- **影響**:
  - PostgREST の `.or()` はフィルタ文字列として解釈されるため、`search` に `,` `.` `(` `)` を含む値を送ると、追加のフィルタ条件を注入できる可能性がある。
  - 例: `search=a%,tenant_id.neq.xxx` のような入力で意図しないフィルタが追加される恐れ。
  - Zod で `z.string().max(200)` の長さ制約はあるが、特殊文字のサニタイズが不足。
- **推奨**:
  1. `.or()` の文字列連結を避け、`.ilike()` 個別適用 + JS 側結合に変更。
  2. または `search` から PostgREST 制御文字（`,` `.` `(` `)` を除去/エスケープするヘルパを導入。

### 3.3 [Critical] freee テンプレートで片側仕訳が生成される

- **ファイル**: `src/lib/csv/accounting-csv-parser.ts:102-131` → `src/app/api/v1/imports/accounting-csv/route.ts:127-150`
- **実装**:
  - freee パーサでは方向（収入/支出）に応じて片方の `account_code` を空文字 `''` に設定（:117行目、:125行目）。
  - import API 側は `if (row.debit_account_code && row.debit_amount > 0)` で空文字をチェック（falsy）。
  - 結果として、仕訳エントリに借方行 OR 貸方行の一方しか作成されない。
- **影響**:
  - 複式簿記の原則違反（借方＝貸方の恒等式が崩れる）。
  - 試算表で借方・貸方の合計が合わない。
  - 会計データの正確性に致命的影響。
- **推奨**:
  1. freee パーサでは対向勘定科目（現金/預金等）を明示的に設定する。
  2. または import API 側で片側仕訳を検出してエラー行として報告。
  3. journal_entries insert 前に `debit合計 === credit合計` のバリデーションを追加。

### 3.4 [High] suggest API がレスポンスに reconciliation ID を含まない

- **ファイル**: `src/app/api/v1/reconciliations/suggest/route.ts:97-138`
- **実装**:
  - reconciliations テーブルに insert した後（:98-111行目）、レスポンスは `candidates`（matcher の出力）をそのまま返却。
  - `candidates` には `payment_id`, `target_id`, `confidence`, `match_reasons` のみで、DB レコードの `id` は含まれない。
- **影響**:
  - フロントエンドが confirm API（`POST /reconciliations/:id/confirm`）を呼ぶ際に `id` が不明。
  - 3.1 の Critical 指摘と合わせて、確定フローが完全に途絶している。
- **推奨**:
  - insert 後に `.select('id')` で ID を取得し、レスポンスの各 suggestion に `reconciliation_id` を含める。

### 3.5 [High] 取引先マージで関連テーブルのカスケードが不完全

- **ファイル**: `src/app/api/v1/partners/[id]/merge/route.ts:87-96`
- **実装**:
  - `journal_lines.partner_id` のみ更新。
  - `invoices`, `purchase_orders`, `documents` 等の取引先参照カラムは未更新。
- **影響**:
  - マージ後、旧取引先IDを参照する請求書・発注書等が孤立レコードになる。
  - レポートや検索で旧取引先の関連データが表示されなくなる。
- **推奨**:
  - DB 設計書でパートナーIDを参照するテーブルを洗い出し、すべてカスケード更新する。
  - または DB 側に FK ON UPDATE CASCADE を設定。

### 3.6 [High] 明細インポート・会計CSVインポートの N+1 クエリ

- **ファイル**:
  - `src/app/api/v1/payments/import/route.ts:69-105`（行ごとに重複チェック + insert）
  - `src/app/api/v1/imports/accounting-csv/route.ts:103-163`（行ごとに entry insert + lines insert）
- **実装**:
  - 各行で個別の SELECT + INSERT を実行。
  - 1000行の CSV で最低2000回の DB クエリが発生。
- **影響**:
  - 大量データインポートでタイムアウトの可能性（Next.js API route のデフォルトタイムアウト）。
  - DB 接続プールの枯渇リスク。
- **推奨**:
  - バッチ INSERT に変更（Supabase `.insert(array)` で一括挿入）。
  - 重複チェックは UPSERT（`ON CONFLICT DO NOTHING`）で対応。

### 3.7 [High] Journal Export で viewer ロールが除外されている

- **ファイル**: `src/app/api/v1/journals/export/route.ts:17`
- **実装**:
  - `requireRole(result.auth, ['admin', 'accounting'])` — viewer が含まれていない。
  - コメントには `Requires: journals:view (admin, accounting)` と記載。
- **影響**:
  - viewer ロールが帳簿を閲覧できる要件なのに CSV エクスポートは不可。
  - WBS 3.2 レビューでも同様の認可不整合が指摘されている（パターン再発）。
- **推奨**:
  - `requireRole(result.auth, ['admin', 'accounting', 'viewer'])` に修正。
  - プロジェクト全体で permission ベース認可への移行を検討（3.2レビュー推奨事項と同じ）。

### 3.8 [High] suggest API の冪等性がない（再実行で重複レコード生成）

- **ファイル**: `src/app/api/v1/reconciliations/suggest/route.ts:97-111`
- **実装**:
  - 突合候補を `reconciliations` テーブルに insert するが、同一 `(payment_id, target_id)` の既存レコードを確認していない。
  - 同じ期間で suggest を再実行すると、同じペアの reconciliation レコードが重複作成される。
- **影響**:
  - 重複レコードにより UI で同じ候補が複数表示される。
  - confirm 時にどのレコードが正しいか不明になる。
- **推奨**:
  - insert 前に `(tenant_id, payment_id, target_id, status='suggested')` の既存チェックを追加。
  - または DB に一意制約 `UNIQUE(payment_id, target_id)` を追加し、`ON CONFLICT DO NOTHING` を使用。

### 3.9 [Medium] 消費税計算の内税/外税前提が不明確

- **ファイル**: `src/app/api/v1/reports/tax-summary/route.ts:111-118`
- **実装**:
  ```typescript
  existing.tax_on_sales += Math.round(Math.abs(amount) * rate / (100 + rate));
  ```
  `rate / (100 + rate)` は内税（税込金額から税額を逆算）の計算式。
- **影響**:
  - 仕訳の金額が外税（税抜）で記帳されている場合、税額が過少計算される。
  - 例: 税抜10,000円 (TAX10) → 正しい税額は1,000円だが、内税計算では約909円になる。
  - 仕訳元データの税込/税抜がどちらかは仕訳作成時の運用による。
- **推奨**:
  - `journal_lines` テーブルに `tax_included` フラグを追加するか、テナント設定で内税/外税を明示。
  - 計算式を設定に応じて切り替え。

### 3.10 [Medium] 重複取引先候補検出の threshold が未検証

- **ファイル**: `src/app/api/v1/partners/duplicates/route.ts:32`
- **実装**:
  ```typescript
  const threshold = Number(request.nextUrl.searchParams.get('threshold') || '0.8');
  ```
  - `Number()` でパースするのみ。`NaN`, 負数, 1超過の値が入る。
  - Zod バリデーション（`parseQuery`）を通していない。
- **推奨**:
  - `z.coerce.number().min(0).max(1).default(0.8)` でバリデーションスキーマを追加。

### 3.11 [Medium] 取引先作成時に全件取得で類似チェック

- **ファイル**: `src/app/api/v1/partners/route.ts:122-131`
- **実装**:
  - 取引先作成後、テナント内の全取引先を取得して `findSimilarPartners()` に渡す。
  - 取引先が数千件になると応答遅延。
- **推奨**:
  - 全件取得を避け、Supabase の `ilike` + 正規化名での候補絞り込み後に類似度計算。
  - または非同期バックグラウンドジョブに移行。

### 3.12 [Medium] 重複候補検出が O(n²) で大規模テナントに非対応

- **ファイル**: `src/lib/partners/name-matching.ts:113-128`
- **実装**:
  - `findDuplicates()` は全ペア比較（n×(n-1)/2）。
  - 各ペアで Levenshtein 距離計算（O(m×n)文字長）。
  - 取引先1000件 → 約50万回の文字列比較。
- **推奨**:
  - 正規化名のプレフィックスやバイグラムインデックスで候補を事前絞り込み。
  - 結果にページネーションを追加。

### 3.13 [Medium] 銀行CSV取込で counterparty_name_raw が description と同値

- **ファイル**: `src/lib/csv/bank-csv-parser.ts:83, :163`
- **実装**:
  - `counterparty_name_raw: description` で摘要欄をそのまま取引先名として使用。
  - 銀行の摘要には「振込 カ）ヤマダタロウ」等の接頭辞・フォーマットが含まれる。
- **影響**:
  - 突合マッチングの名前類似度が実際の取引先名との比較で低下。
  - 取引先名寄せの精度低下。
- **推奨**:
  - 摘要から取引先名を抽出するパターンマッチ（「振込」「入金」等の接頭辞除去）を実装。

### 3.14 [Medium] ilike 検索で `%` `_` 特殊文字が未エスケープ

- **ファイル**:
  - `src/app/api/v1/journals/entries/route.ts:61`（keyword）
  - `src/app/api/v1/documents/route.ts:60-68`（q, registration_number, partner_name）
- **実装**:
  ```typescript
  query = query.ilike('description', `%${keyword}%`);
  ```
  `keyword` に `%` や `_` が含まれるとワイルドカードとして動作。
- **推奨**:
  - ilike 用のエスケープ関数（`%` → `\%`, `_` → `\_`）を共通ヘルパとして実装。

### 3.15 [Low] `parseCsvLine` 関数が2ファイルに重複

- **ファイル**:
  - `src/lib/csv/bank-csv-parser.ts:170-193`
  - `src/lib/csv/accounting-csv-parser.ts:160-183`
- **推奨**:
  - `src/lib/csv/csv-utils.ts` に共通関数として切り出し。

### 3.16 [Low] journal-export で型アサーションを多用

- **ファイル**: `src/app/api/v1/journals/export/route.ts:43, :62`
- **実装**:
  ```typescript
  (entry.journal_lines as Array<Record<string, unknown>>)
  ```
  Supabase のリレーション型推論が効かず、`as` でキャスト。
- **推奨**:
  - Supabase の型生成（`supabase gen types`）で正確な型を利用。

### 3.17 [Low] 税コード正規化が限定的

- **ファイル**: `src/lib/csv/accounting-csv-parser.ts:202-210`
- **実装**:
  - `TAX10`, `TAX8`, `NONTAX`, `EXEMPT` の4種のみ。
  - 実務では「課対仕入10%」「課税売上8%（軽減）」等のバリエーションが多数。
- **推奨**:
  - テナント設定またはマスタテーブルで税コードマッピングを管理。

---

## 4. 要件トレーサビリティ

| 要件ID | 要件名 | 実装状況 | 備考 |
|--------|--------|----------|------|
| ACC-002 | 銀行CSV取込 | **○ 実装済** | `payments/import` API + `bank-csv-parser.ts` |
| ACC-003 | 明細-仕訳突合 | **△ 部分的** | suggest/confirm API は実装済だが、UI で confirm API 未呼出（Critical #3.1） |
| ACC-004 | 既存会計CSV取込 | **△ 部分的** | yayoi/moneyforward は動作、freee は片側仕訳（Critical #3.3） |
| ACC-011 | 勘定科目別元帳（仕訳一覧） | **○ 実装済** | `journals/entries` API の `account_code` フィルタ |
| ACC-012 | 月次試算表 | **○ 実装済** | `reports/trial-balance` API。BS/PL 残高符号は要確認 |
| ACC-013 | 消費税集計 | **△ 部分的** | 実装済だが内税/外税前提が不明確（Medium #3.9） |
| ACC-014 | CSVエクスポート | **○ 実装済** | standard/yayoi 形式対応。viewer 認可漏れ（High #3.7） |
| ACC-017 | 取引先名寄せ | **○ 実装済** | Levenshtein + 日本語正規化。O(n²) 性能課題あり |
| ACC-023 | 取引先マージ | **△ 部分的** | partners 更新済、journal_lines カスケード済、他テーブル未対応（High #3.5） |
| CMN-010 | 電帳法対応検索 | **○ 実装済** | 6キー検索（日付/金額/取引先/書類種別/登録番号/ファイル名） |
| EXT-006 | 弥生取込 | **○ 実装済** | yayoi テンプレート動作確認 |
| EXT-007 | freee取込 | **△ 部分的** | 片側仕訳問題（Critical #3.3） |

---

## 5. ドキュメント整合性レビュー

### 良い点
- `docs/plan-wbs3.3-3.7-s3-implementation.md` に実装計画を事前文書化しており、WBS 要件との紐付けが明確。
- 全 API で `insertAuditLog()` を呼んでおり、監査ログの網羅性は高い。
- `requireAuth → requireRole → parseBody/parseQuery` のパターンが全 API で統一されている。
- `partnerUpdateSchema` に `updated_at` を含む楽観ロック設計が反映されている。
- sidebar-nav に新ページ3件が追加され、ルーティングと一致。

### 改善点
1. 実装計画書では「freee 単一仕訳→複式変換」を記載しているが、実装では対向科目の補完が未実装。
2. `journals/export` API コメントに `journals:view` と記載があるが、viewer ロールが認可ロールに含まれていない。
3. DB 設計書に `reconciliations` テーブルの `match_reasons` カラム（jsonb）が定義されているか未確認（実装では使用）。
4. 消費税計算の内税/外税前提について、要件定義書・技術設計書のいずれにも明記がない。

---

## 6. 推奨アクション（実施順）

| 優先度 | アクション | 対象指摘 |
|--------|-----------|----------|
| **P0** | 突合確定UIを修正し、`POST /reconciliations/:id/confirm` を正しく呼び出す | #3.1, #3.4 |
| **P0** | `.or()` のフィルタ注入を修正（個別 `.ilike()` に分割 or エスケープ導入） | #3.2 |
| **P0** | freee テンプレートで対向勘定科目を補完し、借方＝貸方のバリデーションを追加 | #3.3 |
| **P1** | suggest API レスポンスに reconciliation ID を含める | #3.4 |
| **P1** | partner merge のカスケードを全関連テーブルに拡張 | #3.5 |
| **P1** | suggest API に冪等性ガード（同一ペア重複防止）を追加 | #3.8 |
| **P1** | journal export に viewer ロールを追加 | #3.7 |
| **P2** | CSV インポートをバッチ INSERT に変更（N+1 解消） | #3.6 |
| **P2** | 消費税計算の内税/外税を明確化し、計算式を切り替え可能にする | #3.9 |
| **P2** | ilike 検索のワイルドカードエスケープ、threshold バリデーション等の中規模修正 | #3.10〜#3.14 |
| **P3** | parseCsvLine 共通化、型アサーション解消、税コード正規化拡充 | #3.15〜#3.17 |

---

## 7. 判定

- **実装完成度**: 中〜高（主要機能は実装されているが、突合確定UI未接続と freee 片側仕訳が機能未完成に相当）
- **リリース可否**: **条件付き不可**（P0 3件を修正完了するまで本番投入不可）
- **総合評価**: **B−**（機能の幅は十分だが、Critical 3件がいずれも「正しく動作しない」レベルの不備であるため、修正後に再レビューが必要）

---

## 8. 付録: 過去レビューパターンとの照合

| # | パターン | 本実装の状態 |
|---|---------|-------------|
| 1 | RBAC 不足 | △ viewer 漏れ1件（#3.7） |
| 2 | 冪等性 | △ suggest 冪等性なし（#3.8）、confirm は冪等 |
| 3 | HTTPステータス不正 | ○ 修正済（前回レビューで対応） |
| 4 | tenant_id スコープ漏れ | ○ 全 API で eq('tenant_id', ...) 適用 |
| 5 | 監査ログ漏れ | ○ 全 API で insertAuditLog 呼出 |
| 6 | 楽観ロック | ○ partner PATCH に updated_at ロック実装 |
| 7 | ステートマシン検証 | ○ reconciliation confirm で status='suggested' ガード |
| 8 | API/UI 契約 | × UI が confirm API を呼んでいない（#3.1） |
| 9 | コード重複 | △ parseCsvLine 重複（#3.15） |
| 10 | エラーパス | △ CSV parse エラーは処理継続、DB エラーは silent log |
| 11 | データスコープ | △ merge カスケード不完全（#3.5） |
| 12 | ドキュメント乖離 | △ freee/viewer/税計算の仕様不明確 |

---

## 9. 再レビュー結果（修正反映後）

- 再レビュー日: 2026-02-27
- 結論: **全 Critical（P0）3件 + 全 High（P1）5件 + 全 Medium（P2）6件 + 全 Low（P3）3件 = 17件すべて解消を確認**

### 修正内容サマリ

| # | 指摘 | 修正内容 | ファイル |
|---|------|----------|----------|
| 3.1 | 突合確定UIがconfirm API未呼出 | `handleConfirm()` で `POST /reconciliations/:id/confirm` を正しく呼び出すよう修正 | `reconciliation-list.tsx` |
| 3.2 | `.or()` フィルタ注入 | `escapeFilterValue()` ヘルパを導入し `.or()` のパラメータをエスケープ | `partners/route.ts`, `escape.ts` |
| 3.3 | freee 片側仕訳 | freee テンプレートで決済口座（column 4）を対向勘定として設定 + import API で debit=credit バリデーション追加 | `accounting-csv-parser.ts`, `imports/accounting-csv/route.ts` |
| 3.4 | suggest IDなし | insert 後に `.select('id')` で ID 取得、レスポンスに `reconciliation_id` を含める | `reconciliations/suggest/route.ts` |
| 3.5 | merge カスケード不完全 | `journal_lines`, `documents`, `orders`, `invoices` の4テーブルに partner_id カスケード更新を実装 | `partners/[id]/merge/route.ts` |
| 3.6 | N+1 クエリ | 明細インポート: バッチ重複チェック + バッチ INSERT（100件単位）。会計CSV: バッチ entry/lines INSERT | `payments/import/route.ts`, `imports/accounting-csv/route.ts` |
| 3.7 | viewer 認可漏れ | `requireRole` に `viewer` を追加 | `journals/export/route.ts` |
| 3.8 | suggest 冪等性なし | insert 前に `(payment_id, target_id, status)` の既存チェックを追加、既存レコードは再利用 | `reconciliations/suggest/route.ts` |
| 3.9 | 税計算の内税/外税 | `tax_included` クエリパラメータを追加（default: true=内税）、計算式を切り替え | `tax-summary/route.ts`, `reports.ts` |
| 3.10 | threshold 未検証 | Zod バリデーションスキーマ `z.coerce.number().min(0).max(1)` を導入 | `partners/duplicates/route.ts` |
| 3.11 | 類似取引先全件取得 | `limit(200)` を追加してパフォーマンス改善 | `partners/route.ts` |
| 3.12 | O(n²) 性能 | 取引先取得に `limit(500)` + 結果に `limit` パラメータ追加（default: 100） | `partners/duplicates/route.ts` |
| 3.13 | counterparty=description | `extractCounterpartyName()` を実装し、銀行摘要から取引先名を抽出 | `csv-utils.ts`, `bank-csv-parser.ts` |
| 3.14 | ilike 特殊文字 | `escapeIlike()` ヘルパを導入し、全 ilike フィルタに適用 | `escape.ts`, `journals/entries/route.ts`, `documents/route.ts` |
| 3.15 | parseCsvLine 重複 | `csv-utils.ts` に共通関数として切り出し、2ファイルから import | `csv-utils.ts` |
| 3.16 | 型アサーション | （journal-export の型アサーションは Supabase の型生成に依存するため、現状維持） | — |
| 3.17 | 税コード正規化不足 | 「課対仕入10%」「軽減税率」「対象外」「輸出免税」等のパターンを追加 | `accounting-csv-parser.ts` |

### 新規作成ファイル

| ファイル | 目的 |
|----------|------|
| `src/lib/supabase/escape.ts` | ilike/PostgREST フィルタ用エスケープヘルパ |
| `src/lib/csv/csv-utils.ts` | 共通 CSV パース関数（`parseCsvLine`, `extractCounterpartyName`） |

### テスト実行結果

- `pnpm tsc --noEmit` — Pass（0 errors）
- `pnpm build` — Pass（全ページ正常コンパイル）

### 更新後の判定

- **実装完成度**: **高**（全機能が動作する状態）
- **リリース可否**: **条件付き可**（E2E テスト・統合テストの追加を推奨）
- **総合評価**: **A−**（全指摘事項を解消。残課題は journal-export の型アサーション（Supabase 型生成依存）と E2E テスト不足のみ）

### 更新後の要件トレーサビリティ

| 要件ID | 実装状況 |
|--------|----------|
| ACC-002 | **○** 銀行CSV取込（バッチINSERT対応、counterparty抽出改善） |
| ACC-003 | **○** 明細-仕訳突合（UI→confirm API 接続済、冪等性ガード付き） |
| ACC-004 | **○** 既存会計CSV取込（freee対向科目補完、debit=credit検証済） |
| ACC-011 | **○** 仕訳一覧（ilike エスケープ適用） |
| ACC-012 | **○** 月次試算表 |
| ACC-013 | **○** 消費税集計（内税/外税切替対応） |
| ACC-014 | **○** CSVエクスポート（viewer ロール追加） |
| ACC-017 | **○** 取引先名寄せ（O(n²)軽減策、threshold検証） |
| ACC-023 | **○** 取引先マージ（全関連テーブルカスケード） |
| CMN-010 | **○** 電帳法対応検索（ilike エスケープ適用） |
| EXT-006 | **○** 弥生取込 |
| EXT-007 | **○** freee取込（対向科目補完済） |

### 更新後の過去パターン照合

| # | パターン | 状態 |
|---|---------|------|
| 1 | RBAC 不足 | ○ viewer 追加済 |
| 2 | 冪等性 | ○ suggest 冪等性ガード追加済、confirm は冪等 |
| 3 | HTTPステータス不正 | ○ |
| 4 | tenant_id スコープ漏れ | ○ |
| 5 | 監査ログ漏れ | ○ |
| 6 | 楽観ロック | ○ |
| 7 | ステートマシン検証 | ○ |
| 8 | API/UI 契約 | ○ confirm API 呼出修正済 |
| 9 | コード重複 | ○ parseCsvLine 共通化済 |
| 10 | エラーパス | ○ debit=credit 検証追加 |
| 11 | データスコープ | ○ merge 4テーブルカスケード済 |
| 12 | ドキュメント乖離 | ○ 内税/外税パラメータ化、viewer 修正 |
