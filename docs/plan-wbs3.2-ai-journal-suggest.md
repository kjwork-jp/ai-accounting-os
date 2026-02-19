# WBS 3.2 AI仕訳生成 開発プラン

## 0. 概要

| 項目 | 値 |
|------|-----|
| WBS ID | 3.2 (3.2.1–3.2.5) |
| Sprint | S2 |
| 計画工数 | 13h (5+1+2+4+1) |
| 前提 | WBS 3.1 証憑取込・OCR 実装完了済 |
| 成果物 | journal_suggest Worker / invoice_validate Worker / API 4本 / 仕訳UI 3画面 / テスト |

### 対象WBSタスク

| WBS | タスク | 工数 | 関連要件 |
|-----|--------|------|----------|
| 3.2.1 | 仕訳候補生成エンジン (Claude API Top3 + 信頼度 + 理由 + SSE + 過去確定ルール優先) | 5h | CMN-011, CMN-013, ACC-008, ACC-016, ACC-018 |
| 3.2.2 | 勘定科目マスタUI (科目参照 + 選択UI) | 1h | — |
| 3.2.3 | 信頼度・閾値処理 (0.9↑自動/0.7-0.9確認/0.7↓保留) | 2h | CMN-012 |
| 3.2.4 | 仕訳確認・修正UI (候補選択/修正/確定 + 修正履歴蓄積) | 4h | ACC-005, ACC-010, ACC-019 |
| 3.2.5 | 証憑-仕訳紐付 (1対1/1対多紐付け + トレーサビリティ) | 1h | ACC-009 |

---

## 1. 既存資産の棚卸し

### 1.1 再利用可能（変更不要）

| 資産 | パス | 内容 |
|------|------|------|
| DB型定義 | `src/types/database.ts` | `JournalDraft`, `JournalEntry`, `JournalLine`, `TenantSettings`, `FeedbackEvent` 型定義済 |
| API基盤 | `src/lib/api/helpers.ts` | `requireAuth`, `requireRole`, `parseBody`, `ok`, `conflict` 等 |
| 監査ログ | `src/lib/audit/logger.ts` | `insertAuditLog`, `computeDiff` |
| Queue接続 | `src/lib/queue/connection.ts` | Redis TLS接続設定 |
| Light Queue | `src/lib/queue/queues.ts` | `getLightQueue()` 定義済（attempts=3, exp backoff 2s）|
| Worker基盤 | `worker/src/index.ts` | BullMQ Worker (heavy queue) |
| LLMクライアント | `worker/src/lib/llm-client.ts` | Anthropic SDK初期化、`classifyDocument()` |
| DIクライアント | `worker/src/lib/di-client.ts` | Azure Document Intelligence連携 |
| 構造化データ | `worker/src/jobs/structuring.ts` | `StructuredExtraction` 型 + `structureExtraction()` |
| 勘定科目API | `src/app/api/v1/accounts/route.ts` | GET (一覧) / POST (作成) 実装済 |
| テナント設定API | `src/app/api/v1/tenants/settings/route.ts` | GET/PATCH (閾値取得・更新) 実装済 |
| メトリクス | `worker/src/lib/metrics.ts` | `emitMetric`, `emitLatency`, `SLO`, `METRIC` |
| UIコンポーネント | `src/components/ui/*` | Card, Badge, Table, Dialog, Button, Select, Input 等 |
| 証憑詳細ページ | `src/app/(dashboard)/documents/[id]/page.tsx` | 証憑表示 + extraction表示の基盤 |

### 1.2 拡張が必要

| 資産 | 変更内容 |
|------|----------|
| `worker/src/index.ts` | light queue Worker追加 (invoice_validate + journal_suggest) |
| `worker/src/lib/metrics.ts` | journal_suggest用メトリクス定数追加 |
| `src/lib/queue/enqueue.ts` | `enqueueInvoiceValidate()`, `enqueueJournalSuggest()` 追加 |
| `worker/src/jobs/document-parse.ts` | 成功時に `invoice_validate` ジョブを自動enqueue |
| `src/app/api/v1/documents/[id]/route.ts` | レスポンスに `journal_drafts` を含める |
| `src/app/(dashboard)/documents/[id]/page.tsx` | 仕訳候補セクション追加 |
| `src/lib/audit/logger.ts` | `resolveEntityName` に `journal_entries`, `journal_drafts` 追加 |

### 1.3 新規作成

| # | パス | 内容 |
|---|------|------|
| 1 | `worker/src/jobs/invoice-validate.ts` | インボイスチェックジョブ |
| 2 | `worker/src/jobs/journal-suggest.ts` | 仕訳候補生成ジョブ (Claude API) |
| 3 | `src/lib/queue/enqueue-journal.ts` | enqueue関数 (invoice_validate + journal_suggest) |
| 4 | `src/lib/validators/journals.ts` | Zodスキーマ（draft一覧クエリ、確定リクエスト） |
| 5 | `src/app/api/v1/journals/drafts/route.ts` | GET /journals/drafts 一覧API |
| 6 | `src/app/api/v1/journals/drafts/[id]/route.ts` | GET /journals/drafts/:id 詳細API |
| 7 | `src/app/api/v1/journals/drafts/[id]/confirm/route.ts` | POST 仕訳確定API |
| 8 | `src/app/api/v1/journals/entries/route.ts` | GET /journals/entries 一覧API |
| 9 | `src/components/journals/journal-draft-list.tsx` | 仕訳候補一覧コンポーネント |
| 10 | `src/components/journals/journal-confirm-dialog.tsx` | 確認・修正ダイアログ |
| 11 | `src/components/journals/account-select.tsx` | 勘定科目選択コンポーネント |
| 12 | `src/app/(dashboard)/journals/page.tsx` | 仕訳一覧ページ |
| 13 | `src/__tests__/journal-suggest.test.ts` | 仕訳候補生成テスト |
| 14 | `src/__tests__/invoice-validate.test.ts` | インボイスチェックテスト |

---

## 2. データモデル契約（実装前に確定）

### 2.1 状態遷移図

WBS 3.1で完成した `documents` の状態を前提とし、WBS 3.2は以下のチェーンを追加する。

```
[documents]                    [invoice_checks]        [journal_drafts]           [journal_entries]
 extracted ──(auto)──> invoice_validate ──> ok/needs_review/ng
                                   │
                              ok or needs_review
                                   │
                                   ▼
                           journal_suggest ──> suggested / needs_review / error
                                   │
                          confidence閾値判定
                          ┌────────┼────────┐
                     ≥ high    mid–high    < mid
                          │        │          │
                    auto_confirm  needs_review  needs_review
                          │        │          │
                          ▼        ▼          ▼
                     confirmed   要確認トレイ   保留(不足情報)
                          │        │
                          ▼        ▼ (ユーザー確定)
                   [journal_entries] + [journal_lines]
```

**invoice_validate ジョブ**
- トリガー: `document_parse` 成功後に自動enqueue (document_parse.ts末尾)
- 入力: `{ documentId, tenantId }`
- キュー: `light` (timeout 30s, attempts 3)
- jobId: `invoice_validate:${documentId}:${Date.now()}`
- 処理: `document_extractions.extracted_json` + `documents` からインボイス必須項目チェック
- 出力: `invoice_checks` テーブルINSERT (status: ok/needs_review/ng, reasons JSONB)
- 後続: status が `ok` or `needs_review` の場合 → `journal_suggest` を自動enqueue

**journal_suggest ジョブ**
- トリガー: `invoice_validate` 完了後に自動enqueue
- 入力: `{ documentId, tenantId }`
- キュー: `light` (timeout 60s, attempts 3, rateLimit)
- jobId: `journal_suggest:${documentId}:${Date.now()}`
- 処理: 後述 §2.3
- 出力: `journal_drafts` テーブルINSERT

### 2.2 invoice_checks テーブル

DB設計書に定義済（変更不要）。

```
invoice_checks: {
  id, tenant_id, document_id,
  status: 'ok' | 'needs_review' | 'ng',
  reasons: jsonb,  -- チェック不合格の理由配列
  checked_at, created_at
}
```

チェック項目（インボイス制度必須要件 — PO-005/SO-005）:

| # | チェック項目 | 対応フィールド | NG条件 |
|---|-------------|---------------|--------|
| 1 | 発行者名称 | `vendor_name` | null or 空文字 |
| 2 | 登録番号 | `vendor_registration_number` | null (needs_review: T+13桁でない) |
| 3 | 取引年月日 | `document_date` | null |
| 4 | 取引内容 | `line_items[].description` | 全行空 |
| 5 | 税率区分別対価 | `tax_details` | 空配列 (needs_review) |
| 6 | 消費税額 | `tax_amount` | null (needs_review) |
| 7 | 合計金額 | `total_amount` | null |

- 全項目OK → status='ok'
- 1項目以上needs_review → status='needs_review'
- 発行者名・日付・合計金額いずれか欠落 → status='ng'

### 2.3 journal_suggest 処理フロー

```
1. document_extractions.extracted_json を取得
2. invoice_checks.status/reasons を取得
3. tenant_id で m_accounts (勘定科目一覧) を取得
4. tenant_id で過去の確定仕訳 (feedback_events) を取得 → 学習データ
5. Claude API に以下を送信:
   - 証憑データ (vendor, amount, tax, line_items, document_type)
   - インボイスチェック結果
   - 勘定科目一覧 (code + name + category)
   - 過去確定履歴（同一取引先 × 科目パターン、直近10件）
6. Claude API レスポンス:
   {
     "candidates": [
       {
         "lines": [
           { "account_code": "5100", "account_name": "仕入高", "debit": 10000, "credit": 0, "tax_code": "TAX10", "memo": "" },
           { "account_code": "2100", "account_name": "買掛金", "debit": 0, "credit": 11000, "tax_code": null, "memo": "" },
           { "account_code": "1500", "account_name": "仮払消費税", "debit": 1000, "credit": 0, "tax_code": "TAX10", "memo": "" }
         ],
         "description": "○○社からの仕入",
         "reasoning": "取引先名と金額から仕入取引と判断。過去の確定パターンに基づき仕入高に計上。",
         "confidence": 0.85
       },
       ... (Top 2, Top 3)
     ],
     "overall_confidence": 0.85
   }
7. 借方合計 = 貸方合計 の整合チェック（不一致は error）
8. journal_drafts にINSERT
9. tenant_settings の閾値で status を決定:
   - confidence >= auto_confirm_high (0.90) → status='suggested' (auto confirm候補)
   - confidence >= auto_confirm_mid (0.70) → status='needs_review'
   - confidence < auto_confirm_mid → status='needs_review' (保留扱い)
```

### 2.4 journal_drafts.candidates_json スキーマ

DB設計書の `candidates_json` (jsonb) の具体構造を以下に確定する。

```typescript
interface JournalCandidate {
  lines: Array<{
    account_code: string;    // m_accounts.code
    account_name: string;    // m_accounts.name (表示用)
    debit: number;           // 借方金額
    credit: number;          // 貸方金額
    tax_code: string | null; // m_tax_codes.code
    partner_id?: string;     // partners.id (任意)
    department?: string;     // 部門/拠点 (任意、手動設定想定)
    memo: string;            // 摘要補足
  }>;
  description: string;       // 摘要
  reasoning: string;         // AI推定理由
  confidence: number;        // 候補信頼度 (0.00-1.00)
}

// journal_drafts.candidates_json の型
type CandidatesJson = JournalCandidate[];  // Top3配列
```

### 2.5 journal_entries / journal_lines 確定時のデータフロー

```
POST /api/v1/journals/drafts/{id}/confirm
  ↓
  1. journal_drafts を取得 (status != 'confirmed' を確認)
  2. selected_index (0-2) の候補を取得
  3. overrideLines がある場合、候補のlinesを上書き
  4. 借方合計 == 貸方合計 を検証
  5. journal_entries INSERT:
     - entry_date = documents.document_date ?? 現在日付
     - description = candidate.description
     - source_type = 'document'
     - source_id = documents.id
     - status = 'confirmed'
     - total_amount = 借方合計
     - tax_amount = 税額合計
     - journal_draft_id = journal_drafts.id
     - confirmed_by = auth.userId
  6. journal_lines INSERT (各行):
     - journal_entry_id = 上記のid
     - line_no = 1..n
     - account_code, account_name, debit, credit, tax_code, partner_id, memo
  7. journal_drafts を UPDATE:
     - status = 'confirmed'
     - selected_index = リクエスト値
     - confirmed_by = auth.userId
     - confirmed_at = now()
  8. feedback_events INSERT (CMN-006/ACC-019 学習データ):
     - entity_type = 'journal_draft'
     - entity_id = journal_drafts.id
     - ai_output_json = candidates_json
     - user_correction_json = 実際に確定した仕訳データ (overrideがあれば差分含む)
  9. 監査ログ INSERT:
     - action = 'confirm'
     - entity_type = 'journal_entries'
     - entity_id = journal_entries.id
     - diff_json = { draft_id, selected_index, override: boolean }
```

### 2.6 RBAC権限マッピング

技術設計書 `03_API一覧` と `SEC-005` に基づく。

| API | Method | 必要権限 | ロール |
|-----|--------|----------|--------|
| `/journals/drafts` | GET | journals:view | admin, accounting |
| `/journals/drafts/:id` | GET | journals:view | admin, accounting |
| `/journals/drafts/:id/confirm` | POST | journals:confirm | admin, accounting |
| `/journals/entries` | GET | journals:view | admin, accounting |
| `/accounts` | GET | accounts:view | admin, accounting (既存) |

### 2.7 監査ログ action 命名

WBS 3.1 レビュー P1 で指摘された「既存規約との整合」を踏まえ、以下に統一する。

| 操作 | action | entity_type | 備考 |
|------|--------|-------------|------|
| 仕訳候補生成(Worker) | `create` | `journal_drafts` | Worker内ではaudit log不要（自動処理） |
| 仕訳確定 | `confirm` | `journal_entries` | diff_json に draft_id, selected_index |
| 仕訳修正確定 | `confirm` | `journal_entries` | diff_json に override=true, changes |

---

## 3. Claude API プロンプト設計

### 3.1 システムプロンプト

```
あなたは日本の会計実務に精通したAI経理担当です。
証憑データから適切な仕訳候補を3つ生成してください。

ルール:
1. 借方合計 = 貸方合計（貸借一致必須）
2. 消費税は税抜経理方式（仮払消費税/仮受消費税を使用）
3. 勘定科目は提供された科目一覧からのみ選択
4. 税区分は TAX10（10%）/ TAX8（軽減8%）/ NONTAX（非課税）/ EXEMPT（免税）
5. 候補は信頼度の高い順に並べる
6. 過去の確定パターンがある場合は優先的に採用

JSON形式で回答:
{
  "candidates": [
    {
      "lines": [
        {"account_code":"...", "account_name":"...", "debit":0, "credit":0, "tax_code":"TAX10"|"TAX8"|"NONTAX"|"EXEMPT"|null, "memo":""}
      ],
      "description": "摘要文",
      "reasoning": "推定理由",
      "confidence": 0.0〜1.0
    }
  ],
  "overall_confidence": 0.0〜1.0
}
```

### 3.2 ユーザーメッセージ構成

```
--- 証憑情報 ---
文書種別: {document_type}
取引先: {vendor_name}
書類日付: {document_date}
合計金額: ¥{total_amount}
税額: ¥{tax_amount}
明細:
{line_items をフォーマット}

--- インボイスチェック ---
ステータス: {invoice_check.status}
{reasons があれば表示}

--- 使用可能な勘定科目 ---
{m_accounts の code, name, category を一覧}

--- 過去の確定パターン（同一取引先） ---
{feedback_events から直近10件}
```

### 3.3 レスポンスバリデーション

1. JSON パース（非貪欲regex `\{[\s\S]*?\}` は使わず、`\[[\s\S]*?\]` または全文JSON.parse）
2. `candidates` 配列が1-3個であること
3. 各候補の `lines` で Σdebit == Σcredit
4. `account_code` が m_accounts に存在すること
5. `tax_code` が m_tax_codes に存在すること（null許容）
6. `confidence` が 0.00-1.00 の範囲内

バリデーション失敗時: journal_drafts を status='error' で保存し、ログ出力。

---

## 4. 実装ステップ（マイルストーン分割）

WBS 3.1 レビューで「段階的リリース」が推奨されたため、M1→M2→M3で分割する。

### M1: Worker パイプライン（5h）

#### Step 1: invoice_validate ジョブ (1.5h)

新規ファイル: `worker/src/jobs/invoice-validate.ts`

```
処理フロー:
1. document_extractions.extracted_json を取得
2. documents.document_type を取得
3. §2.2 のチェック項目を順次検証
4. invoice_checks テーブルINSERT
5. ok/needs_review → journal_suggest をenqueue
6. ng → ログ出力のみ（journal_suggest は実行しない）
```

enqueue関数: `src/lib/queue/enqueue-journal.ts` に `enqueueInvoiceValidate()`, `enqueueJournalSuggest()` を定義。

#### Step 2: journal_suggest ジョブ (2.5h)

新規ファイル: `worker/src/jobs/journal-suggest.ts`

```
処理フロー:
1. extraction + invoice_check 取得
2. m_accounts 取得（テナント別、is_active=true）
3. 過去の確定パターン取得（feedback_events WHERE entity_type='journal_draft' AND tenant_id）
4. Claude API 呼出（§3 のプロンプト）
5. レスポンスバリデーション（§3.3）
6. 信頼度に基づく status 決定（tenant_settings 閾値参照）
7. journal_drafts INSERT
8. メトリクス出力
```

#### Step 3: Worker light queue 登録 (0.5h)

`worker/src/index.ts` に light queue Worker を追加。

```typescript
// 既存 heavy worker に加えて light worker を追加
const lightWorker = new Worker('light', async (job) => {
  switch (job.name) {
    case 'invoice_validate': return processInvoiceValidate(job);
    case 'journal_suggest': return processJournalSuggest(job);
    default: log('warn', `Unknown light job: ${job.name}`);
  }
}, { connection: getRedisConfig(), concurrency: 4 });
```

#### Step 4: document_parse → invoice_validate チェーン (0.5h)

`worker/src/jobs/document-parse.ts` の成功パス末尾に追加:

```typescript
// Step 8: Chain → invoice_validate (non-fatal)
try {
  await enqueueInvoiceValidate({ documentId, tenantId });
  log('info', 'Chained invoice_validate job');
} catch (err) {
  log('warn', 'Failed to enqueue invoice_validate (non-fatal)', { ... });
}
```

### M2: API + 仕訳確定ロジック (4h)

#### Step 5: journal Zodスキーマ (0.5h)

新規: `src/lib/validators/journals.ts`

```typescript
// GET /journals/drafts クエリ
export const journalDraftsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['suggested', 'needs_review', 'confirmed', 'error']).optional(),
  document_id: z.string().uuid().optional(),
});

// POST /journals/drafts/:id/confirm リクエスト
export const journalConfirmSchema = z.object({
  selectedIndex: z.number().int().min(0).max(2),
  overrideLines: z.array(z.object({
    account_code: z.string().min(1),
    account_name: z.string().min(1),
    debit: z.number().min(0),
    credit: z.number().min(0),
    tax_code: z.enum(['TAX10', 'TAX8', 'NONTAX', 'EXEMPT']).nullable(),
    partner_id: z.string().uuid().nullable().optional(),
    memo: z.string().max(500).default(''),
  })).optional(),
  overrideDescription: z.string().max(500).optional(),
});
```

#### Step 6: GET /journals/drafts API (0.5h)

- フィルタ: status, document_id
- ページネーション: page, per_page
- JOIN: documents (file_name, document_type) を含む
- RBAC: admin, accounting

#### Step 7: GET /journals/drafts/:id API (0.5h)

- journal_drafts + documents + document_extractions + invoice_checks をJOIN
- candidates_json の各候補にある account_code を m_accounts で解決
- RBAC: admin, accounting

#### Step 8: POST /journals/drafts/:id/confirm API (2h)

§2.5 のデータフロー全体を実装。

```
重要な実装ポイント:
1. 楽観ロック: .eq('status', 'suggested').or('status.eq.needs_review') + .select('id').single()
   → 0件なら 409 Conflict（WBS 3.1 H-2 と同じパターン）
2. 借方合計 == 貸方合計 の検証 → 不一致なら 400 Bad Request
3. account_code が m_accounts に存在するか検証 → 不存在なら 400
4. Idempotency-Key ヘッダ推奨（二重確定防止、技術設計書 04_API設計詳細）
5. トランザクション: journal_entries + journal_lines + journal_drafts更新 + feedback_events を一括
   → Supabase では単一rpcか順次INSERTで対応（失敗時は手動ロールバック）
6. 監査ログ: action='confirm', entity_type='journal_entries'
```

#### Step 9: GET /journals/entries API (0.5h)

- フィルタ: period (date range), status, source_type
- JOIN: journal_lines, journal_drafts (via journal_draft_id)
- ページネーション
- RBAC: admin, accounting

### M3: フロントエンドUI (4h)

#### Step 10: 勘定科目選択コンポーネント (0.5h)

新規: `src/components/journals/account-select.tsx`

```
- /api/v1/accounts から取得
- category別にグループ化 (asset/liability/equity/revenue/expense)
- 検索フィルタ付きSelect (code + name で検索)
- shadcn/ui Select ベース
```

#### Step 11: 仕訳候補一覧ページ (1.5h)

新規: `src/app/(dashboard)/journals/page.tsx` + `src/components/journals/journal-draft-list.tsx`

```
- タブ: 「要確認」(needs_review) / 「自動確定候補」(suggested) / 「確定済」(confirmed)
- 各行: 証憑名、取引先、金額、信頼度バッジ、状態バッジ
- クリック → 確認ダイアログ
- ポーリング: needs_review/suggested は 10秒間隔で更新
```

#### Step 12: 仕訳確認・修正ダイアログ (1.5h)

新規: `src/components/journals/journal-confirm-dialog.tsx`

```
構成:
- 左: 証憑プレビュー（既存 DocumentPreview 再利用）
- 右上: Top3候補をタブ/カード切替で表示
  - 各候補: 信頼度バッジ + AI理由テキスト + 仕訳明細テーブル
- 右下: 仕訳明細の編集フォーム
  - 勘定科目 → AccountSelect
  - 借方/貸方 → number input
  - 税区分 → Select (TAX10/TAX8/NONTAX/EXEMPT)
  - 行追加/削除ボタン
  - 貸借一致チェック（リアルタイムバリデーション）
  - 摘要テキスト編集
- フッター:
  - 「この候補で確定」ボタン (selectedIndex送信)
  - 「修正して確定」ボタン (overrideLines送信)
  - 貸借不一致時はボタン無効化 + エラー表示
```

#### Step 13: 証憑詳細ページへの仕訳セクション追加 (0.5h)

`src/app/(dashboard)/documents/[id]/page.tsx` を拡張:

```
- journal_drafts を取得 (document_id で紐付)
- 未確定: 候補Top3のサマリー表示 + 「確認・確定」ボタン
- 確定済: journal_entries + journal_lines の表示
- ACC-009 トレーサビリティ: 証憑 → 仕訳の紐付を視覚的に表示
```

---

## 5. テスト計画

### 5.1 ユニットテスト (Vitest)

| テスト | 対象 | ケース |
|--------|------|--------|
| `invoice-validate.test.ts` | チェックロジック | OK/needs_review/ng の3パターン、各チェック項目の境界値 |
| `journal-suggest.test.ts` | LLMレスポンス解析 | 正常Top3、借方貸方不一致エラー、不正JSON、空配列 |
| `journal-suggest.test.ts` | 信頼度閾値 | auto_confirm_high=0.9/mid=0.7 での status 分岐 |
| `journal-suggest.test.ts` | account_code 検証 | 存在するコード/存在しないコードのバリデーション |

### 5.2 API テスト

| API | テストケース |
|-----|-------------|
| `GET /journals/drafts` | 一覧取得、statusフィルタ、ページネーション、RBAC (viewer拒否) |
| `POST /journals/drafts/:id/confirm` | 正常確定、借方貸方不一致400、重複確定409、未存在404、override付き確定 |
| `GET /journals/entries` | 一覧取得、periodフィルタ |

### 5.3 結合テスト

```
証憑アップロード → OCR → invoice_validate → journal_suggest → 候補表示 → 確定
のE2Eフロー（モック環境で）
```

---

## 6. メトリクス・SLO

### 6.1 追加メトリクス定数

```typescript
// worker/src/lib/metrics.ts に追加
export const METRIC = {
  // ... existing
  INVOICE_VALIDATE_SUCCESS: 'invoice_validate_success',
  INVOICE_VALIDATE_FAILURE: 'invoice_validate_failure',
  JOURNAL_SUGGEST_LATENCY_MS: 'journal_suggest_latency_ms',
  JOURNAL_SUGGEST_SUCCESS: 'journal_suggest_success',
  JOURNAL_SUGGEST_FAILURE: 'journal_suggest_failure',
  JOURNAL_SUGGEST_CONFIDENCE: 'journal_suggest_confidence',
  JOURNAL_CONFIRM_COUNT: 'journal_confirm_count',
  JOURNAL_OVERRIDE_COUNT: 'journal_override_count',
} as const;
```

### 6.2 SLO

| メトリクス | SLO | 備考 |
|-----------|-----|------|
| journal_suggest P95 latency | ≤ 15s | Claude API応答 + DB I/O |
| journal_suggest 成功率 | ≥ 95% | LLM出力パース失敗含む |
| invoice_validate P95 latency | ≤ 5s | DBクエリのみ |

---

## 7. セキュリティ考慮

| 観点 | 対応 |
|------|------|
| RBAC | 全APIに `requireRole(['admin', 'accounting'])` (§2.6) |
| テナント分離 | 全クエリに `.eq('tenant_id', ...)` + RLS |
| 入力バリデーション | Zodスキーマで全リクエストボディ検証 |
| LLMインジェクション | OCRテキストを4000文字制限 + プロンプト分離（system/user） |
| 監査証跡 | 確定操作に監査ログ必須 (CMN-005) |
| AI出力記録 | feedback_events にAI出力 + ユーザー修正の全記録 (CMN-006) |
| 楽観ロック | 確定APIで状態チェック + `.select('id').single()` (WBS 3.1 H-2パターン) |

---

## 8. ファイル一覧（全新規・変更ファイル）

### 新規作成 (14ファイル)

| # | パス |
|---|------|
| 1 | `worker/src/jobs/invoice-validate.ts` |
| 2 | `worker/src/jobs/journal-suggest.ts` |
| 3 | `src/lib/queue/enqueue-journal.ts` |
| 4 | `src/lib/validators/journals.ts` |
| 5 | `src/app/api/v1/journals/drafts/route.ts` |
| 6 | `src/app/api/v1/journals/drafts/[id]/route.ts` |
| 7 | `src/app/api/v1/journals/drafts/[id]/confirm/route.ts` |
| 8 | `src/app/api/v1/journals/entries/route.ts` |
| 9 | `src/components/journals/journal-draft-list.tsx` |
| 10 | `src/components/journals/journal-confirm-dialog.tsx` |
| 11 | `src/components/journals/account-select.tsx` |
| 12 | `src/app/(dashboard)/journals/page.tsx` |
| 13 | `src/__tests__/journal-suggest.test.ts` |
| 14 | `src/__tests__/invoice-validate.test.ts` |

### 変更 (6ファイル)

| # | パス | 変更内容 |
|---|------|----------|
| 1 | `worker/src/index.ts` | light queue Worker追加 |
| 2 | `worker/src/lib/metrics.ts` | journal系メトリクス定数追加 |
| 3 | `worker/src/jobs/document-parse.ts` | 成功時 invoice_validate enqueue |
| 4 | `src/app/api/v1/documents/[id]/route.ts` | レスポンスに journal_drafts 追加 |
| 5 | `src/app/(dashboard)/documents/[id]/page.tsx` | 仕訳候補セクション追加 |
| 6 | `src/lib/audit/logger.ts` | resolveEntityName に journal系追加 |

---

## 9. WBS 3.1 レビュー指摘の反映チェックリスト

WBS 3.1で受けた指摘を本プランで同じ問題を起こさないよう確認。

| WBS 3.1 指摘 | 本プランでの対応 | 状態 |
|-------------|-----------------|------|
| H-1: RBAC未実装 | §2.6 で全APIのRBACを明記。`requireRole` 必須 | ✅ 対応済 |
| H-2: 楽観更新の競合未検知 | §2.5 Step 8 で `.select('id').single()` + 409パターン明記 | ✅ 対応済 |
| M-1: SLO値不整合 | §6.2 でjournal_suggest SLOを独立定義 | ✅ 対応済 |
| M-2: 空catchログ不足 | Worker内の全catchで構造化ログ出力を明記 | ✅ 対応済 |
| P0: 型の不整合 | §2.4 で candidates_json スキーマを事前確定 | ✅ 対応済 |
| P0: status競合 | §2.1 で各ジョブの状態遷移を責務分離して明記 | ✅ 対応済 |
| P0: 保存先曖昧 | 全テーブルの保存先を明確に指定(invoice_checks, journal_drafts, feedback_events) | ✅ 対応済 |
| P1: 監査ログaction命名 | §2.7 で `confirm` actionを明記、既存規約と整合 | ✅ 対応済 |
| P1: 可観測性不足 | §6 でメトリクス + SLO定義 | ✅ 対応済 |

---

## 10. 実装順序サマリー

```
M1 (5h): Worker パイプライン
  Step 1: invoice-validate ジョブ         [1.5h]
  Step 2: journal-suggest ジョブ           [2.5h]
  Step 3: Worker light queue登録           [0.5h]
  Step 4: document-parse → チェーン        [0.5h]
  → 4-point check (tsc/test/build)

M2 (4h): API + 確定ロジック
  Step 5: Zodスキーマ                      [0.5h]
  Step 6: GET /journals/drafts             [0.5h]
  Step 7: GET /journals/drafts/:id         [0.5h]
  Step 8: POST /journals/drafts/:id/confirm [2.0h]
  Step 9: GET /journals/entries             [0.5h]
  → 4-point check

M3 (4h): フロントエンドUI
  Step 10: AccountSelect コンポーネント    [0.5h]
  Step 11: 仕訳候補一覧ページ              [1.5h]
  Step 12: 確認・修正ダイアログ            [1.5h]
  Step 13: 証憑詳細への仕訳セクション      [0.5h]
  → 4-point check + 最終確認
```

合計: 13h（WBS計画値13hと一致）

---

## 11. 自己レビュー指摘対応（実装前確定事項）

本プランの自己レビューで発見した問題とその対応を以下に明記する。

### F-01 [Critical] SSE（Server-Sent Events）の扱い

**WBS 3.2.1 に「SSE」が明記**されており、技術設計書 `07_同期処理安全柵` でも journal_suggest に「Streaming SSEで逐次表示」と記載がある。

**MVP方針（意図的限定）:**

SSEの完全実装（Worker→Redis Pub/Sub→API SSEエンドポイント→EventSource）は非同期アーキテクチャに対する大幅な追加工数となる。本プランでは以下のように段階的に対応する:

- **M1-M3（MVP）**: ポーリング方式（10秒間隔）で仕訳候補の完了を検知。UIにローディング状態を表示。
  - 技術的理由: journal_suggest はWorker内で実行されるため、APIサーバーからのSSE配信にはWorker→API間のメッセージングレイヤ（Redis Pub/Sub）が必要。MVPの13h内では工数超過。
- **Phase 1.5（次スプリント候補）**: SSEエンドポイント `GET /journals/drafts/:id/stream` を追加。BullMQ の `Job.progress()` イベントをRedis Pub/Subで中継し、フロントエンドの `EventSource` で受信。

この判断はWBS所有者の承認を得て進める。

### F-02 [Critical] confirm APIリクエストスキーマの技術設計書との差異

技術設計書 `04_API設計詳細` では confirm リクエストが `{ "selectedIndex": 1, "overrideReason": "..." }` と定義されている。本プランでは `overrideLines` / `overrideDescription` を追加している。

**対応**: 技術設計書の仕様をスーパーセットとして拡張する。confirm Zodスキーマを以下に修正:

```typescript
export const journalConfirmSchema = z.object({
  selectedIndex: z.number().int().min(0).max(2),
  overrideReason: z.string().max(500).optional(),        // 技術設計書の既存フィールド
  overrideLines: z.array(z.object({                      // 本プラン追加
    account_code: z.string().min(1),
    account_name: z.string().min(1),
    debit: z.number().min(0),
    credit: z.number().min(0),
    tax_code: z.enum(['TAX10', 'TAX8', 'NONTAX', 'EXEMPT']).nullable(),
    partner_id: z.string().uuid().nullable().optional(),
    department: z.string().max(100).nullable().optional(), // F-14対応: journal_lines.department
    memo: z.string().max(500).default(''),
  })).optional(),
  overrideDescription: z.string().max(500).optional(),
});
```

### F-03 [Important] jobIdフォーマット

技術設計書では `journal_suggest:{documentId}` のようなタイムスタンプなしのjobIdを定義している。しかしWBS 3.1で `doc_parse` のjobIdにタイムスタンプを追加した経緯がある（BullMQ `removeOnComplete` 後の再投入でジョブIDが衝突するため）。

**対応**: WBS 3.1と同じパターンを採用。重複投入防止はAPI層のstatus gate（楽観ロック）で担保する。

```
invoice_validate:${documentId}:${Date.now()}
journal_suggest:${documentId}:${Date.now()}
```

### F-04 [Important] 自動確定（auto-confirm）の定義

CMN-012は「0.9↑自動」を要求するが、会計コンプライアンスの観点から完全自動確定（ユーザー操作なし）はリスクが高い。

**対応**: `suggested` ステータスは「ワンクリック確定可能」を意味し、ユーザーの明示的な確認操作を必須とする。

- `suggested`: 確認ダイアログを開くと内容がプリセットされ、「確定」ボタン1クリックで完了（修正不要の場合）
- `needs_review`: 確認ダイアログで内容の精査が必要なことをUI上で強調

ただし、将来的に `tenant_settings` にフラグ `auto_confirm_enabled` を追加し、完全自動を選択可能にする余地を残す。

### F-07 [Important] confidence値のDB格納時クランプ

`journal_drafts.confidence` は `numeric(3,2)` で範囲 -9.99〜9.99。LLMが1.0を超える値を返す可能性を防御する。

**対応**: Worker内のjournal_drafts INSERT前に以下のクランプを適用:

```typescript
const clampedConfidence = Math.min(1.0, Math.max(0.0, overallConfidence));
```

### F-08 [Important] 確定APIのトランザクション整合性

Supabaseはクライアントライブラリ経由でのマルチテーブルトランザクションを直接サポートしない。

**対応**: Supabase RPC（database function）として `confirm_journal_draft` を作成し、4つの書き込み操作を単一トランザクションで実行:

```sql
CREATE OR REPLACE FUNCTION confirm_journal_draft(
  p_draft_id uuid,
  p_tenant_id uuid,
  p_selected_index int,
  p_entry_date date,
  p_description text,
  p_lines jsonb,
  p_confirmed_by uuid,
  p_feedback_json jsonb
) RETURNS uuid AS $$
DECLARE
  v_entry_id uuid;
BEGIN
  -- 1. journal_drafts UPDATE (楽観ロック)
  -- 2. journal_entries INSERT
  -- 3. journal_lines INSERT (複数行)
  -- 4. feedback_events INSERT
  -- COMMIT (自動)
  RETURN v_entry_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

これにより中間失敗時は自動ロールバック。新規マイグレーションファイルが1つ追加。

### F-09 [Important] 3段階信頼度の区別

CMN-012の3段階（自動/確認/保留）を `needs_review` 1つに統合していた問題。

**対応**: DB statusは `needs_review` のまま（スキーマ変更を避ける）。`journal_drafts.confidence` カラムに格納された値でUI側で区別する:

- 一覧ページのフィルタに「信頼度」セレクトを追加: 「高信頼度 (≥0.7)」「低信頼度 (<0.7)」
- 低信頼度の行には「情報不足」バッジを表示し、補足入力を促す
- ソートデフォルト: confidence DESC（高信頼度を上に）

### F-06 [Important] 監査ログの entity_name 解決

**対応**: `resolveEntityName` に以下を追加:

```typescript
case 'journal_entries': {
  const { data } = await supabase
    .from('journal_entries')
    .select('description, entry_date')
    .eq('id', entityId)
    .single();
  return data?.description || `仕訳 ${data?.entry_date}` || null;
}
case 'journal_drafts': {
  const { data } = await supabase
    .from('journal_drafts')
    .select('documents(file_name)')
    .eq('id', entityId)
    .single();
  return (data as any)?.documents?.file_name || null;
}
```

### F-05 [Important] 技術設計書に未記載のAPI

`GET /journals/drafts/:id` は技術設計書 `03_API一覧` に未記載。実装時に技術設計書側も更新する（本プランのスコープ外だがTODOとして記録）。

### F-14 [Minor] department フィールド

`journal_lines.department` は JournalCandidate の lines にも含める（§2.4修正済、F-02のconfirmスキーマにも追加）。Claude APIプロンプトには含めない（部門情報は証憑から推定困難。手動設定を想定）。

---

## 12. 最終チェックリスト

| # | チェック項目 | 状態 |
|---|-------------|------|
| 1 | 全APIにRBAC (`requireRole`) 明記 | ✅ |
| 2 | 全クエリにtenant_id分離 | ✅ |
| 3 | 状態遷移の責務分離（API/Worker） | ✅ |
| 4 | 楽観ロック + 409 Conflict パターン | ✅ |
| 5 | candidates_json スキーマ事前確定 | ✅ |
| 6 | 監査ログ action 命名の整合 | ✅ |
| 7 | メトリクス + SLO定義 | ✅ |
| 8 | Zodバリデーション全リクエスト | ✅ |
| 9 | feedback_events でAI出力+修正記録 | ✅ |
| 10 | SSE → MVP限定でポーリング (Phase 1.5にSSE追加) | ✅ 方針明記 |
| 11 | confirm API スキーマ → 技術設計書と整合 | ✅ overrideReason追加 |
| 12 | トランザクション整合性 → Supabase RPC | ✅ |
| 13 | confidence クランプ (0.0-1.0) | ✅ |
| 14 | 3段階信頼度のUI区別 | ✅ |
| 15 | department フィールド対応 | ✅ |
