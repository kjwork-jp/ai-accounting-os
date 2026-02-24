# WBS 3.3–3.7 実装計画書 (S3 帳簿・出力 / 明細取込 / 取引先管理 / 証憑検索 / 会計CSV取込)

## 0. 概要

| 項目 | 値 |
|------|-----|
| WBS ID | 3.3 (3.3.1–3.3.4), 3.4 (3.4.1–3.4.3), 3.5 (3.5.1–3.5.3), 3.6 (3.6.1–3.6.2), 3.7 (3.7.1–3.7.3) |
| Sprint | S3 (一部 S2 からの繰り越し含む) |
| 計画工数 | 31h (9+7+7+4+4) |
| 前提 | WBS 3.1 証憑取込・OCR + WBS 3.2 AI仕訳生成 実装完了済 |
| ブランチ | `claude/plan-accounting-features-9OYZm` |

### 対象WBSタスク

| WBS | タスク | 工数 | 関連要件 |
|-----|--------|------|----------|
| 3.3.1 | 仕訳一覧・検索 | 3h | ACC-011 |
| 3.3.2 | 月次試算表 | 3h | ACC-012 |
| 3.3.3 | 消費税集計 | 2h | ACC-013 |
| 3.3.4 | CSVエクスポート | 1h | ACC-014 (D-6逸脱: CSV代替) |
| 3.4.1 | 銀行CSV取込 | 3h | ACC-002 |
| 3.4.2 | 明細-仕訳突合 | 3h | — |
| 3.4.3 | クレカCSV取込 | 1h | ACC-003 |
| 3.5.1 | 取引先CRUD | 3h | ACC-023 |
| 3.5.2 | 名寄せ簡易 | 2h | ACC-017 |
| 3.5.3 | 重複検知・統合 | 2h | EXT-006, EXT-007 |
| 3.6.1 | 証憑検索UI 6キー | 3h | CMN-010 |
| 3.6.2 | 検索DB最適化 | 1h | — |
| 3.7.1 | CSV+プレビュー | 1.5h | ACC-004 (D-2逸脱: 手動マッピング) |
| 3.7.2 | 手動列マッピング | 1.5h | ACC-004 |
| 3.7.3 | 3形式テンプレート | 1h | ACC-004 |

---

## 1. 既存資産の棚卸し

### 1.1 再利用可能（変更不要）

| 資産 | パス | 内容 |
|------|------|------|
| DB型定義 | `src/types/database.ts` | Partner, Payment, Reconciliation, JournalEntry, JournalLine, Document, InvoiceLine 等 |
| API基盤 | `src/lib/api/helpers.ts` | `requireAuth`, `requireRole`, `parseBody`, `parseQuery`, `ok`, `created`, `badRequest`, `notFound`, `conflict`, `internalError`, `getRequestId` |
| 監査ログ | `src/lib/audit/logger.ts` | `insertAuditLog`, `computeDiff` — partners, journal_entries, documents 対応済 |
| Supabase | `src/lib/supabase/server.ts` | `createServerSupabase`, `createAdminSupabase` |
| Auth | `src/lib/auth/helpers.ts` | `getCurrentTenantUser`, `hasPermission` (11 permissions) |
| UIコンポーネント | `src/components/ui/*` | DataTable, Card, Badge, Button, Select, Input, Dialog, Table, Label, Separator |
| 勘定科目API | `src/app/api/v1/accounts/route.ts` | GET/POST 実装済 |
| 仕訳一覧API | `src/app/api/v1/journals/entries/route.ts` | GET 基本実装済（拡張必要） |
| 証憑一覧API | `src/app/api/v1/documents/route.ts` | GET 基本実装済（6キー検索拡張必要） |
| サイドバー | `src/components/layouts/sidebar-nav.tsx` | 取引先(partners)ナビ項目既存 |

### 1.2 拡張が必要

| 資産 | 変更内容 |
|------|----------|
| `src/app/api/v1/journals/entries/route.ts` | 検索パラメータ追加（account_code, keyword）|
| `src/lib/validators/journals.ts` | `journalEntriesQuerySchema` 拡張 + export用スキーマ追加 |
| `src/lib/validators/documents.ts` | 6キー検索パラメータ追加（registration_number, tax_rate） |
| `src/app/api/v1/documents/route.ts` | 6キー検索フィルタ追加 |
| `src/app/(dashboard)/journals/page.tsx` | タブ構成に変更（仕訳一覧 / 試算表 / 消費税） |
| `src/app/(dashboard)/documents/page.tsx` | 6キー検索パネル追加 |

---

## 2. 新規作成ファイル一覧

### 2.1 API Routes (11本)

| # | パス | メソッド | 概要 |
|---|------|----------|------|
| 1 | `src/app/api/v1/journals/export/route.ts` | GET | 仕訳CSVエクスポート |
| 2 | `src/app/api/v1/reports/trial-balance/route.ts` | GET | 月次試算表 |
| 3 | `src/app/api/v1/reports/tax-summary/route.ts` | GET | 消費税集計 |
| 4 | `src/app/api/v1/partners/route.ts` | GET, POST | 取引先一覧・作成 |
| 5 | `src/app/api/v1/partners/[id]/route.ts` | GET, PATCH | 取引先詳細・更新 |
| 6 | `src/app/api/v1/partners/[id]/merge/route.ts` | POST | 取引先統合 |
| 7 | `src/app/api/v1/partners/duplicates/route.ts` | GET | 重複検知候補一覧 |
| 8 | `src/app/api/v1/payments/import/route.ts` | POST | 銀行/クレカCSV取込 |
| 9 | `src/app/api/v1/reconciliations/suggest/route.ts` | POST | 突合候補生成 |
| 10 | `src/app/api/v1/reconciliations/[id]/confirm/route.ts` | POST | 突合確定 |
| 11 | `src/app/api/v1/imports/accounting-csv/route.ts` | POST | 既存会計CSV取込 |

### 2.2 バリデータ (4本)

| # | パス | 概要 |
|---|------|------|
| 1 | `src/lib/validators/partners.ts` | 取引先CRUD用スキーマ |
| 2 | `src/lib/validators/payments.ts` | 明細取込・突合用スキーマ |
| 3 | `src/lib/validators/reports.ts` | 試算表・消費税集計用スキーマ |
| 4 | `src/lib/validators/imports.ts` | 会計CSV取込用スキーマ |

### 2.3 ビジネスロジック (5本)

| # | パス | 概要 |
|---|------|------|
| 1 | `src/lib/csv/journal-export.ts` | 仕訳CSV生成ロジック |
| 2 | `src/lib/csv/bank-csv-parser.ts` | 銀行CSV解析（全銀フォーマット等） |
| 3 | `src/lib/csv/accounting-csv-parser.ts` | 会計CSV解析・マッピング・テンプレート |
| 4 | `src/lib/partners/name-matching.ts` | 取引先名寄せロジック（レーベンシュタイン距離） |
| 5 | `src/lib/reconciliation/matcher.ts` | 突合マッチングロジック（金額・日付・名前ベース） |

### 2.4 UIコンポーネント (12本)

| # | パス | 概要 |
|---|------|------|
| 1 | `src/components/journals/journal-entry-list.tsx` | 確定仕訳一覧テーブル |
| 2 | `src/components/journals/journal-export-button.tsx` | CSVエクスポートボタン |
| 3 | `src/components/reports/trial-balance-table.tsx` | 試算表テーブル |
| 4 | `src/components/reports/tax-summary-table.tsx` | 消費税集計テーブル |
| 5 | `src/components/partners/partner-list.tsx` | 取引先一覧 |
| 6 | `src/components/partners/partner-form.tsx` | 取引先作成・編集フォーム |
| 7 | `src/components/partners/partner-merge-dialog.tsx` | 取引先統合ダイアログ |
| 8 | `src/components/partners/duplicate-list.tsx` | 重複検知一覧 |
| 9 | `src/components/payments/csv-import-form.tsx` | 明細CSV取込フォーム |
| 10 | `src/components/payments/reconciliation-list.tsx` | 突合候補一覧 |
| 11 | `src/components/documents/document-search-panel.tsx` | 電帳法6キー検索パネル |
| 12 | `src/components/imports/accounting-csv-import.tsx` | 会計CSV取込ウィザード |

### 2.5 ページ (4本)

| # | パス | 概要 |
|---|------|------|
| 1 | `src/app/(dashboard)/partners/page.tsx` | 取引先管理ページ |
| 2 | `src/app/(dashboard)/payments/page.tsx` | 明細取込・突合ページ |
| 3 | `src/app/(dashboard)/reports/page.tsx` | 帳簿・レポートページ |
| 4 | `src/app/(dashboard)/imports/page.tsx` | 会計CSV取込ページ |

---

## 3. 要件トレーサビリティマトリクス

| 要件ID | 要件名 | WBS | 実装箇所 | 検証方法 |
|--------|--------|-----|----------|----------|
| ACC-011 | 仕訳データ出力 | 3.3.1, 3.3.4 | journals/entries API拡張 + export API + journal-entry-list + export-button | API応答確認、CSV出力確認 |
| ACC-012 | 月次試算表 | 3.3.2 | reports/trial-balance API + trial-balance-table | BS/PL科目別集計一致確認 |
| ACC-013 | 消費税集計 | 3.3.3 | reports/tax-summary API + tax-summary-table | 税率別集計一致確認 |
| ACC-014 | 税理士提出データ (D-6逸脱) | 3.3.4 | journals/export API (CSV形式) | CSV出力・弥生形式互換確認 |
| ACC-002 | 銀行明細CSV取込 | 3.4.1 | payments/import API + bank-csv-parser + csv-import-form | 全銀CSVパース・payments INSERT確認 |
| ACC-003 | クレカ明細CSV取込 | 3.4.3 | payments/import API (type=credit_card) | クレカCSVパース確認 |
| ACC-017 | 取引先名寄せ | 3.5.2 | partners/name-matching + partner API | 類似名検出・提案確認 |
| ACC-023 | 取引先不明処理 | 3.5.1 | partners CRUD API + partner-list/form | CRUD操作確認 |
| EXT-006 | 名寄せ統合 | 3.5.2-3.5.3 | partners/merge API + merge-dialog | 統合後参照整合性確認 |
| EXT-007 | 重複検知 | 3.5.3 | partners/duplicates API + duplicate-list | 重複候補自動検出確認 |
| CMN-010 | 証憑検索(6キー) | 3.6.1-3.6.2 | documents API拡張 + document-search-panel | 6キー検索応答確認 |
| ACC-004 | 既存会計CSV取込 (D-2逸脱) | 3.7.1-3.7.3 | imports/accounting-csv API + accounting-csv-import | 3形式テンプレ + 手動マッピング確認 |

---

## 4. 過去レビュー指摘回避チェックリスト

以下12パターンを全API/UIで遵守する。

| # | パターン | 対策 | 適用箇所 |
|---|----------|------|----------|
| 1 | RBAC欠落 | 全APIで `requireRole()` 呼出必須。roles: admin/accounting → CRUD, viewer → GET only | 全11 API |
| 2 | 冪等性欠如 | confirm系APIに `Idempotency-Key` ヘッダ対応。DB側 UNIQUE制約でダブルポスト防止 | reconciliations/confirm, partners/merge |
| 3 | ロールvs権限ベース | `requireRole()` + sidebar-nav.tsx の roles 配列の一致を保証 | 全API + UI |
| 4 | SLO未定義 | レポートAPI: 5s/p95目標。CSV取込: 10s/1000行目標。APIレスポンスログにlatency出力 | reports, imports |
| 5 | HTTPステータスコード誤り | 400(バリデーション), 404(リソース無), 409(競合), 500(サーバエラー) を正確に使い分け | 全API |
| 6 | API/UI契約不一致 | APIレスポンス型をUIコンポーネントで明示的にtype定義。meta/pagination形式統一 | 全API+UI |
| 7 | コード重複 | CSVパーサーを共通lib化。バリデータ共通化 | csv/, validators/ |
| 8 | エラーパステスト不足 | 400/403/404/409ケースを意識した実装 | 全API |
| 9 | 楽観ロック欠如 | PATCH系APIで `updated_at` ベースの楽観ロック（`eq('updated_at', original)` 条件付きUPDATE） | partners PATCH |
| 10 | テナントスコープ不足 | 全クエリで `.eq('tenant_id', auth.tenantId)` 必須 | 全API |
| 11 | 状態遷移不明確 | reconciliation: suggested→confirmed/rejected のみ許可。明示的バリデーション | reconciliations/confirm |
| 12 | ドキュメント乖離 | 本計画書のAPI仕様と実装の一致を最終レビューで検証 | 全体 |

---

## 5. 詳細実装仕様

### 5.1 WBS 3.3 帳簿・出力

#### 5.1.1 仕訳一覧・検索 (3.3.1)

**API拡張: GET /api/v1/journals/entries**
- 追加パラメータ: `account_code`, `keyword`(description ilike検索)
- `account_code` 指定時: journal_lines とJOINして account_code 一致する entry を返す
- 既存の status, source_type, date_from, date_to に加えて拡張
- レスポンス形式: 既存の `{ data, pagination }` を維持

**バリデータ拡張: `journalEntriesQuerySchema`**
```
account_code: z.string().max(10).optional()
keyword: z.string().max(200).optional()
```

**UIコンポーネント: `journal-entry-list.tsx`**
- サーバーサイドページネーション（API呼出）
- フィルタ: 期間(date_from/to), ステータス, ソース種別, 勘定科目, キーワード
- 各行: entry_date, description, total_amount, status, source_type
- 展開行: journal_lines 詳細（借方/貸方/科目/税区分）

#### 5.1.2 月次試算表 (3.3.2)

**API: GET /api/v1/reports/trial-balance**
- パラメータ: `year_month` (YYYY-MM), `comparison`(前月比 boolean)
- ロール: admin, accounting, viewer
- ロジック:
  1. `journal_entries` (status=confirmed, entry_date in month) → `journal_lines` を集約
  2. `m_accounts` の category で BS(asset/liability/equity) / PL(revenue/expense) 分類
  3. 勘定科目別に debit合計, credit合計, 残高(debit-credit) を算出
  4. comparison=true の場合、前月も同様に計算して差分列追加
- レスポンス:
```json
{
  "data": {
    "year_month": "2026-01",
    "accounts": [
      { "code": "1010", "name": "現金", "category": "asset", "debit_total": 500000, "credit_total": 100000, "balance": 400000, "prev_balance": 350000 }
    ],
    "summary": {
      "total_debit": 1000000,
      "total_credit": 1000000,
      "bs_balance": 0,
      "pl_balance": 0
    }
  }
}
```

#### 5.1.3 消費税集計 (3.3.3)

**API: GET /api/v1/reports/tax-summary**
- パラメータ: `date_from`, `date_to`
- ロール: admin, accounting, viewer
- ロジック:
  1. `journal_lines` (confirmed entries in range) を tax_code 別に集約
  2. 税率別(10%, 8%, 非課税, 免税)の課税売上/課税仕入を算出
  3. 仮受消費税/仮払消費税を科目コードから特定
- レスポンス:
```json
{
  "data": {
    "period": { "from": "2026-01-01", "to": "2026-01-31" },
    "tax_rates": [
      { "tax_code": "TAX10", "rate": 10, "taxable_sales": 1000000, "tax_on_sales": 100000, "taxable_purchases": 500000, "tax_on_purchases": 50000, "net_tax": 50000 }
    ],
    "total": { "taxable_sales": 1500000, "total_tax_on_sales": 130000, "taxable_purchases": 800000, "total_tax_on_purchases": 68000, "net_tax_payable": 62000 }
  }
}
```

#### 5.1.4 CSVエクスポート (3.3.4)

**API: GET /api/v1/journals/export**
- パラメータ: `date_from`, `date_to`, `format` (default: 'standard', 'yayoi')
- ロール: admin, accounting
- ロジック:
  1. 確定仕訳(status=confirmed)を取得
  2. journal_lines を展開してCSV行に変換
  3. format='yayoi': 弥生会計互換CSV形式
  4. format='standard': 標準仕訳帳CSV形式
- レスポンス: `Content-Type: text/csv`, `Content-Disposition: attachment`
- CSVヘッダ例(standard): 日付,伝票番号,摘要,借方科目,借方金額,貸方科目,貸方金額,税区分

### 5.2 WBS 3.4 明細取込・突合

#### 5.2.1 銀行CSV取込 (3.4.1)

**API: POST /api/v1/payments/import**
- ボディ: multipart/form-data (`file`, `payment_type`: 'bank'|'credit_card')
- ロール: admin, accounting
- ロジック:
  1. CSVファイルを解析（Shift_JIS対応、全銀フォーマット自動検出）
  2. 各行を payments テーブルに INSERT
  3. `counterparty_name_raw` に元の取引先名を保存
  4. 重複チェック: (tenant_id, occurred_on, amount, counterparty_name_raw) の組合せで既存レコード確認
  5. 重複行はスキップし、スキップ件数をレスポンスに含める
- レスポンス:
```json
{
  "data": { "imported": 45, "skipped": 3, "total_rows": 48 }
}
```

**CSVパーサー: `bank-csv-parser.ts`**
- 全銀協フォーマット（固定列: 日付, 摘要, 出金, 入金, 残高）
- 三井住友/みずほ/三菱UFJ等の主要行フォーマット自動検出
- Shift_JIS→UTF-8変換
- 日付パース（YYYY/MM/DD, YYYY-MM-DD, YYYYMMDD対応）

#### 5.2.2 明細-仕訳突合 (3.4.2)

**API: POST /api/v1/reconciliations/suggest**
- ボディ: `{ date_from, date_to }`
- ロール: admin, accounting
- ロジック:
  1. 未突合の payments (tenant_id, date range) を取得
  2. 未突合の journal_entries (confirmed, date range) を取得
  3. マッチングアルゴリズム:
     - 完全一致: 金額 + 日付 ±3日
     - 部分一致: 金額一致 + counterparty_name_raw ∋ partner.name
     - 各候補にconfidence score (0-1) 付与
  4. reconciliations テーブルに status=suggested で INSERT
- レスポンス: `{ data: Reconciliation[], summary: { matched, unmatched } }`

**API: POST /api/v1/reconciliations/[id]/confirm**
- ロール: admin, accounting
- ロジック:
  1. reconciliation が suggested 状態であることを確認（状態遷移バリデーション）
  2. status を confirmed に更新
  3. matched_by に userId を記録
  4. 監査ログ挿入
- 冪等性: 既に confirmed なら 200 で現在の状態を返す（エラーにしない）

#### 5.2.3 クレカCSV取込 (3.4.3)

- payments/import API を `payment_type=credit_card` で再利用
- CSVパーサーにクレカ明細フォーマット追加（利用日, 利用店, 金額）
- direction は常に 'out'

### 5.3 WBS 3.5 取引先管理

#### 5.3.1 取引先CRUD (3.5.1)

**API: GET /api/v1/partners**
- パラメータ: `page`, `per_page`, `search`(name ilike), `category`, `is_active`
- ロール: admin, accounting, viewer
- `merged_into_id IS NULL` のみ表示（統合済は除外）

**API: POST /api/v1/partners**
- ボディ: `{ name, name_kana?, registration_number?, category, address?, phone?, email?, bank_info? }`
- ロール: admin, accounting
- 作成時: 自動的に重複候補チェック実行（name類似度80%以上を警告レスポンスに含める）
- 監査ログ挿入

**API: GET /api/v1/partners/[id]**
- ロール: admin, accounting, viewer

**API: PATCH /api/v1/partners/[id]**
- ロール: admin, accounting
- 楽観ロック: `updated_at` 条件付きUPDATE
- 監査ログ（diff_json付き）

#### 5.3.2 名寄せ簡易 (3.5.2)

**名寄せロジック: `name-matching.ts`**
- レーベンシュタイン距離ベースの類似度計算
- カタカナ/ひらがな正規化、株式会社/（株）等の略称正規化
- 類似度閾値: 0.8 (80%) 以上を候補として提示
- POST /api/v1/partners 作成時に自動実行

#### 5.3.3 重複検知・統合 (3.5.3)

**API: GET /api/v1/partners/duplicates**
- ロール: admin, accounting
- ロジック: テナント内全パートナーの名前ペアで類似度計算
- 結果をconfidenceスコア降順で返す

**API: POST /api/v1/partners/[id]/merge**
- ボディ: `{ merge_from_ids: string[] }`
- ロール: admin
- ロジック:
  1. merge_from_ids のパートナーの merged_into_id を [id] に設定
  2. 関連テーブル (journal_lines.partner_id, payments.counterparty→partner連携) の参照を更新
  3. 統合元パートナーの is_active を false に設定
  4. 監査ログ（統合元・統合先を記録）
- 冪等性: 既に統合済の場合は 200 で現在の状態を返す

### 5.4 WBS 3.6 証憑検索(電帳法)

#### 5.4.1 証憑検索UI 6キー (3.6.1)

**電帳法6キー**: 取引年月日, 取引金額, 取引先名, 書類種別, 登録番号, 受領日(=created_at)

**API拡張: GET /api/v1/documents**
- 追加パラメータ:
  - `registration_number`: 登録番号部分一致検索
  - `partner_name`: 取引先名部分一致（documents→partner→name JOIN or counterparty直接検索）
- 既存パラメータで対応可能: `document_type`(書類種別), `date_from/date_to`(取引年月日), `amount_min/amount_max`(取引金額)

**バリデータ拡張: `documentsListQuerySchema`**
```
registration_number: z.string().max(20).optional()
partner_name: z.string().max(200).optional()
```

**UIコンポーネント: `document-search-panel.tsx`**
- 6キー入力フォーム（取引年月日範囲、金額範囲、取引先名、書類種別、登録番号）
- 検索結果: 既存DocumentListコンポーネント再利用
- 検索条件クリアボタン

#### 5.4.2 検索DB最適化 (3.6.2)

**INDEXヒント**（RLS経由のため直接DDLは追加しないが、設計として記録）:
- `documents(tenant_id, document_date)` — 日付範囲検索
- `documents(tenant_id, amount)` — 金額範囲検索
- `documents(tenant_id, registration_number)` — 登録番号検索
- `documents(tenant_id, document_type)` — 種別フィルタ

注: Supabaseマネージド環境のため、INDEXはSupabase Dashboard/SQL Editorで追加推奨。
本実装ではクエリ最適化（必要カラムのみSELECT、適切なフィルタ順序）で対応。

### 5.5 WBS 3.7 既存会計CSV取込

#### 5.5.1 CSV+プレビュー (3.7.1)

**API: POST /api/v1/imports/accounting-csv**
- ボディ: multipart/form-data (`file`, `template`: 'yayoi'|'freee'|'moneyforward'|'custom', `column_mapping?`)
- ロール: admin, accounting
- Step 1 (preview): `preview=true` パラメータの場合、パース結果の先頭20行を返す
- Step 2 (import): `preview=false` で実際にインポート実行

#### 5.5.2 手動列マッピング (3.7.2)

- `column_mapping` パラメータ: `{ date: 0, description: 1, debit_account: 2, debit_amount: 3, credit_account: 4, credit_amount: 5, tax_code: 6 }`
- カラムインデックスでマッピング指定
- テンプレート使用時はマッピング不要（プリセット適用）

#### 5.5.3 3形式テンプレート (3.7.3)

**テンプレート定義: `accounting-csv-parser.ts`**
- 弥生会計: 日付(0), 伝票No(1), 借方科目(2), 借方金額(3), 貸方科目(4), 貸方金額(5), 摘要(6)
- freee: 日付(0), 勘定科目(1), 税区分(2), 金額(3), 取引先(4), 摘要(5), 収支区分(6)
- Money Forward: 日付(0), 借方科目コード(1), 借方科目(2), 借方金額(3), 貸方科目コード(4), 貸方科目(5), 貸方金額(6), 摘要(7)

**インポートロジック**:
1. CSVパース（Shift_JIS対応）
2. テンプレートorカスタムマッピングで各行を解釈
3. journal_entries + journal_lines に INSERT (source_type='manual')
4. status='confirmed' で直接確定
5. 監査ログ（インポート件数記録）

---

## 6. 実装順序

依存関係を考慮し、以下の順序で実装する。

| Step | WBS | 内容 | 依存 |
|------|-----|------|------|
| 1 | 3.5 | 取引先管理（CRUD + 名寄せ + 統合） | なし |
| 2 | 3.3.1 | 仕訳一覧・検索API拡張 + UI | なし |
| 3 | 3.3.2 | 月次試算表 | 仕訳データ前提 |
| 4 | 3.3.3 | 消費税集計 | 仕訳データ前提 |
| 5 | 3.3.4 | CSVエクスポート | 仕訳一覧前提 |
| 6 | 3.4.1 | 銀行CSV取込 | 取引先管理前提 |
| 7 | 3.4.3 | クレカCSV取込 | 銀行CSV取込と共通基盤 |
| 8 | 3.4.2 | 明細-仕訳突合 | 明細取込 + 仕訳一覧前提 |
| 9 | 3.6 | 証憑検索(電帳法) | なし（既存拡張） |
| 10 | 3.7 | 既存会計CSV取込 | なし |

---

## 7. 品質チェック計画

### 7.1 4-point check
1. **lint**: `npx next lint` — エラー0件
2. **typecheck**: `npx tsc --noEmit` — エラー0件
3. **test**: `npx vitest run` — 全テスト通過
4. **build**: `npx next build` — ビルド成功

### 7.2 要件照合チェック
- 全12要件(ACC-002/003/004/011/012/013/014/017/023, CMN-010, EXT-006/007)の実装箇所を確認
- 各APIのRBAC, テナント分離, 監査ログ, エラーハンドリングを確認

### 7.3 レビュー指摘再発チェック
- 12パターン全項目を実装後に再確認（§4のチェックリスト）
