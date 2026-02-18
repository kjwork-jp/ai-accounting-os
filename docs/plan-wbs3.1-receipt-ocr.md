# WBS 3.1 証憑取込・OCR 開発プラン

> **Sprint:** S2 Phase 1
> **総工数:** 18h（3.1.1〜3.1.6）
> **前提:** S1完了済み（認証・共通基盤・Upload API・監査ログ）
> **作成日:** 2026-02-18

---

## 0. 現状分析（既存資産の棚卸し）

### 実装済み（再利用する）

| 資産 | ファイル | 状態 |
|------|---------|------|
| ファイルアップロードAPI | `src/app/api/v1/documents/upload/route.ts` | **完成** — SHA-256, 10MB制限, 重複検知(ハッシュ), Idempotency-Key, Supabase Storage保存 |
| 認証・テナント解決 | `src/lib/api/helpers.ts` (`requireAuth`) | **完成** |
| RBAC権限チェック | `src/lib/auth/helpers.ts` (`hasPermission`) | **完成** — `documents:upload`, `documents:view` |
| 監査ログ | `src/lib/audit/logger.ts` | **完成** |
| DB型定義 | `src/types/database.ts` | **完成** — Document, DocumentExtraction, InvoiceCheck 型あり |
| UIコンポーネント基盤 | `src/components/ui/*` | **完成** — button, card, data-table, dialog, badge, input, select, table 等 |
| DashboardLayout | `src/components/layouts/*` | **完成** — sidebar-nav にドキュメントリンクあり |
| Supabase Storage設定 | Bucket `documents` | **完成** |
| DBスキーマ | `documents`, `document_extractions`, `invoice_checks` テーブル | **適用済み** |
| パッケージ | `bullmq@5.69.3`, `ioredis@5.9.3` | **インストール済み** |

### 未実装（本プランで新規作成）

| 区分 | ディレクトリ | 状態 |
|------|------------|------|
| Azure DI クライアント | `src/lib/di/` | `.gitkeep` のみ |
| Claude API クライアント | `src/lib/llm/` | `.gitkeep` のみ |
| BullMQ キュー定義 | `src/lib/queue/` | `.gitkeep` のみ |
| Worker ジョブ | `worker/src/jobs/`, `worker/src/queues/`, `worker/src/lib/` | `.gitkeep` のみ |
| 証憑一覧ページ | `src/app/(dashboard)/documents/` | ページなし |
| 証憑詳細ページ | `src/app/(dashboard)/documents/[id]/` | `.gitkeep` のみ |
| 証憑コンポーネント | `src/components/documents/` | `.gitkeep` のみ |
| enqueue-parse API | `src/app/api/v1/documents/[id]/enqueue-parse/` | `.gitkeep` のみ |

---

## 1. アーキテクチャ概要

```
┌──────────────────────────────────────────────────────────────────┐
│  Frontend (Vercel / Next.js)                                     │
│                                                                  │
│  ┌─────────────────┐   ┌──────────────────────────────────────┐ │
│  │ Upload UI       │   │ Documents List / Detail Page          │ │
│  │ (D&D + Batch)   │   │ (状態表示・リトライ・検索)             │ │
│  └────────┬────────┘   └──────────────┬───────────────────────┘ │
│           │                           │                          │
│  ┌────────▼───────────────────────────▼───────────────────────┐ │
│  │ API Route Handlers                                         │ │
│  │  POST /documents/upload → Storage + DB + Enqueue           │ │
│  │  POST /documents/:id/enqueue-parse → Job投入               │ │
│  │  GET  /documents → 一覧(フィルタ・ページネーション)          │ │
│  │  GET  /documents/:id → 詳細(抽出結果・分類・チェック結果)    │ │
│  │  POST /documents/:id/retry → 失敗ジョブ再投入              │ │
│  │  GET  /documents/:id/status → ポーリング用ステータス        │ │
│  └────────────────────────┬───────────────────────────────────┘ │
└───────────────────────────┼────────────────────────────────────┘
                            │ BullMQ enqueue
                   ┌────────▼────────┐
                   │  Azure Redis    │
                   │  (BullMQ Broker)│
                   └────────┬────────┘
                            │ consume
┌───────────────────────────▼────────────────────────────────────┐
│  Worker (Azure Container Apps Jobs)                             │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Job: document_parse (heavy queue)                         │   │
│  │  1. Supabase Storageからファイル取得                       │   │
│  │  2. Azure Document Intelligence API呼び出し               │   │
│  │  3. 抽出結果をdocument_extractionsに保存 (3.1.3)          │   │
│  │  4. Claude APIで文書分類 → documents.document_type更新     │   │
│  │     (3.1.4)                                               │   │
│  │  5. documents.status → 'extracted'                        │   │
│  │  6. invoice_validateジョブをenqueue (後続Sprint用)         │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. 実装ステップ（依存順）

### Step 1: 共通インフラ層（キュー・DI・LLMクライアント）

#### 2.1.1 Redis接続・BullMQキュー定義

**新規ファイル:**
- `src/lib/queue/connection.ts` — Redis接続設定（`ioredis`、Azure Redis TLS対応）
- `src/lib/queue/queues.ts` — heavy/light キュー定義 + DLQ設定
- `src/lib/queue/enqueue.ts` — API側からジョブを投入するヘルパー

**設計ポイント:**
```
// connection.ts
- AZURE_REDIS_HOST, AZURE_REDIS_PORT(6380), AZURE_REDIS_KEY を使用
- TLS: true (Azure Cache for Redis はTLS必須)
- maxRetriesPerRequest: null (BullMQ要件)
- enableReadyCheck: false

// queues.ts
- heavy キュー: document_parse 用（タイムアウト240s、retry 5回）
- light キュー: invoice_validate, journal_suggest 用（タイムアウト30-60s）
- DLQ: 失敗後のジョブ移動先

// enqueue.ts
- enqueueDocumentParse(documentId, tenantId) → jobId = `doc_parse:${documentId}`
- 冪等性: 同一jobIdの重複投入防止
```

#### 2.1.2 Azure Document Intelligence クライアント

**新規ファイル:**
- `src/lib/di/client.ts` — Azure DI REST API ラッパー

**設計ポイント:**
```
- AZURE_DI_ENDPOINT, AZURE_DI_KEY を使用
- analyzeDocument() メソッド:
  1. POST /{model}/analyze (prebuilt-invoice モデル)
  2. ポーリング: GET {operationUrl} (間隔 >= 2秒)
  3. Retry-After ヘッダー遵守
  4. 429 → exponential backoff (2s, 4s, 8s, 16s, 32s)
- レート制限: BullMQ limiter で POST 15TPS を保証
- タイムアウト: 単一リクエスト60秒、全体240秒
- レスポンス型定義: DiAnalyzeResult (fields, pages, confidence)
```

#### 2.1.3 Claude API クライアント

**新規ファイル:**
- `src/lib/llm/client.ts` — Anthropic SDK ラッパー

**設計ポイント:**
```
- ANTHROPIC_API_KEY, LLM_MODEL を使用
- classifyDocument(extractedText, mimeType) → DocumentTypeCode
- structureExtraction(rawFields, documentType) → StructuredExtraction
- 共通: system prompt、temperature=0、max_tokens制限
- エラーハンドリング: 429 backoff, 5xx retry
- コスト追跡: input/output tokens をログ出力
```

---

### Step 2: Worker基盤 (WBS 3.1.2)

#### 2.2.1 Worker エントリーポイント

**新規ファイル:**
- `worker/src/index.ts` — Worker エントリーポイント（BullMQ Worker起動）
- `worker/src/lib/supabase.ts` — Worker用 Supabase Admin クライアント
- `worker/package.json` — Worker用依存定義
- `worker/tsconfig.json` — Worker用TypeScript設定
- `worker/Dockerfile` — ACA Jobs用コンテナイメージ

**設計ポイント:**
```
// index.ts
- heavy queue の Worker を起動
- graceful shutdown (SIGTERM/SIGINT)
- concurrency: 2（ACA vCPU制限考慮）
- BullMQ limiter: { max: 15, duration: 1000 } (DI 15TPS制限)

// Dockerfile
- FROM node:22-slim
- workdir /app
- COPY worker/ + src/lib/ + src/types/ (共有型)
- RUN pnpm install --frozen-lockfile
- CMD ["node", "--loader", "tsx", "src/index.ts"]
```

#### 2.2.2 document_parse ジョブ実装

**新規ファイル:**
- `worker/src/jobs/document-parse.ts` — OCRジョブ本体

**処理フロー:**
```
1. ジョブペイロード受信: { documentId, tenantId }
2. documents テーブルの status を 'processing' に更新
3. Supabase Storage からファイル取得 (storage_bucket + file_key)
4. Azure DI API 呼び出し (analyzeDocument)
   - prebuilt-invoice モデル使用
   - PDF/画像 対応
   - ポーリング >= 2秒間隔
5. 抽出結果の構造化 (Step 3 で詳述)
6. Claude API で文書分類 (Step 4 で詳述)
7. document_extractions テーブルに保存:
   {
     document_id, tenant_id,
     extracted_json: { ... },
     model_provider: 'azure',
     model_name: 'prebuilt-invoice',
     confidence: <DI confidence>,
     extracted_at: now()
   }
8. documents テーブル更新:
   - status → 'extracted'
   - document_type → 分類結果
   - document_date, amount, tax_amount, registration_number → 抽出値
9. 成功ログ + 監査ログ出力
10. (将来) invoice_validate ジョブを enqueue

失敗時:
- BullMQ retry: attempts=5, backoff exponential (5s→5m)
- 全retry失敗 → status='error', DLQへ移動
```

**retry設計（技術設計書 07_安全柵仕様 準拠）:**
```
{
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 5000    // 5s → 30s → 3m → 15m → ~1h
  },
  removeOnComplete: 100,  // 直近100件保持
  removeOnFail: false      // DLQ用に保持
}
```

---

### Step 3: 抽出データ構造化 (WBS 3.1.3)

**新規ファイル:**
- `worker/src/jobs/structuring.ts` — OCR結果の構造化ロジック

**処理:**
```
Azure DI の rawFields を以下の統一JSONに変換:

{
  vendor_name: string | null,         // 発行者名
  vendor_address: string | null,      // 発行者住所
  vendor_registration_number: string | null,  // 適格請求書登録番号 (T + 13桁)
  customer_name: string | null,       // 宛先
  document_date: string | null,       // YYYY-MM-DD
  due_date: string | null,            // 支払期日
  invoice_number: string | null,      // 請求書番号
  subtotal: number | null,            // 小計
  tax_amount: number | null,          // 消費税額
  total_amount: number | null,        // 合計金額
  tax_details: Array<{
    rate: number,                     // 10 or 8
    taxable_amount: number,
    tax_amount: number
  }>,
  line_items: Array<{
    description: string,
    quantity: number | null,
    unit_price: number | null,
    amount: number,
    tax_rate: number | null           // 10 or 8
  }>,
  raw_text: string,                   // OCR全文テキスト
  confidence: number                  // 0.0-1.0
}

- DI フィールドマッピング（prebuilt-invoice モデル）:
  VendorName → vendor_name
  VendorAddress → vendor_address
  InvoiceDate → document_date
  DueDate → due_date
  InvoiceTotal → total_amount
  SubTotal → subtotal
  TotalTax → tax_amount
  Items[].Description → line_items[].description
  Items[].Amount → line_items[].amount
  Items[].Quantity → line_items[].quantity
  Items[].UnitPrice → line_items[].unit_price

- 日本語請求書特有の補完:
  - 登録番号 (T+13桁) の正規表現抽出: /T\d{13}/
  - 税率別内訳の解析（DI が抽出できない場合 → Claude API 補完）
  - 日付形式の正規化 (令和X年 → YYYY-MM-DD)
```

---

### Step 4: 文書自動分類 (WBS 3.1.4)

**実装場所:** `worker/src/jobs/document-parse.ts` 内のサブ処理（別関数として切り出し）

**新規ファイル:**
- `worker/src/jobs/classification.ts` — 分類ロジック

**処理:**
```
// 2段階分類:
// (1) ルールベース（高速・高確度）
//   - MIMEタイプ + DI モデル信頼度で判定
//   - CSV/XLSX → bank_statement or credit_card
//   - DI prebuilt-invoice confidence >= 0.8 → invoice
//
// (2) Claude API（曖昧な場合のフォールバック）
//   - 分類: invoice(請求書) / receipt(領収書) / quotation(見積書) /
//           contract(契約書) / other(その他)
//   - Prompt: 抽出テキスト + 構造化データを入力
//   - temperature=0, max_tokens=100
//   - JSON mode で { type, confidence, reason } を返す

// documents.document_type を更新
// 既存の upload 時の暫定分類(MIME依存)を上書き
```

---

### Step 5: 重複証憑検知の強化 (WBS 3.1.5)

**既存:** Upload API で SHA-256 ハッシュ完全一致チェック済み（`route.ts:70-83`）

**追加実装:**
- `src/app/api/v1/documents/[id]/duplicates/route.ts` — 類似証憑検索API

**強化ポイント:**
```
// 既存: SHA-256 完全一致 → アップロード時にブロック (実装済み)
// 追加: 「日付 + 金額」近似チェック（OCR抽出後に実行）

// document_parse ジョブ内で実行:
// 1. 抽出された document_date + amount を取得
// 2. 同一テナント内で (date ±3日) AND (amount 完全一致) の既存文書を検索
// 3. ヒットした場合 → documents に duplicate_suspect_ids (JSONB) を記録
//    ※DB列追加不要の場合は document_extractions.extracted_json 内に格納
// 4. UI側で警告バッジ表示
```

---

### Step 6: API Route Handlers

#### 2.6.1 証憑一覧 API

**新規ファイル:**
- `src/app/api/v1/documents/route.ts` — GET: 一覧取得

**設計:**
```
GET /api/v1/documents
  Query params:
    - page (default: 1)
    - per_page (default: 20, max: 100)
    - status: uploaded | processing | extracted | verified | error
    - document_type: invoice | receipt | quotation | contract | other
    - date_from, date_to: YYYY-MM-DD
    - amount_min, amount_max: number
    - q: キーワード検索(file_name部分一致)
    - sort_by: created_at | document_date | amount (default: created_at)
    - sort_order: asc | desc (default: desc)

  Response:
    { data: Document[], meta: { total, page, per_page, total_pages } }

  認可: documents:view (admin, accounting, viewer)
  Zodバリデーション: src/lib/validators/documents.ts
```

#### 2.6.2 証憑詳細 API

**新規ファイル:**
- `src/app/api/v1/documents/[id]/route.ts` — GET: 詳細取得

**設計:**
```
GET /api/v1/documents/:id
  Response: {
    data: {
      ...Document,
      extractions: DocumentExtraction | null,
      invoice_check: InvoiceCheck | null,
      duplicate_suspects: Document[] | null
    }
  }

  認可: documents:view
  テナント分離: tenant_id フィルタ必須
```

#### 2.6.3 OCR enqueue API

**新規ファイル:**
- `src/app/api/v1/documents/[id]/enqueue-parse/route.ts` — POST: OCR処理開始

**設計:**
```
POST /api/v1/documents/:id/enqueue-parse
  前提条件: status = 'uploaded' or 'error'（processing/extracted は拒否）
  処理:
    1. documents.status → 'processing' に更新
    2. BullMQ heavy queue に document_parse ジョブを投入
    3. jobId = `doc_parse:${documentId}` (冪等)
  Response: { data: { jobId, status: 'queued' } }
  認可: documents:upload (admin, accounting)
  監査ログ: action='enqueue_parse'
```

#### 2.6.4 リトライ API

**新規ファイル:**
- `src/app/api/v1/documents/[id]/retry/route.ts` — POST: 失敗ジョブ再実行

**設計:**
```
POST /api/v1/documents/:id/retry
  前提条件: status = 'error'
  処理:
    1. documents.status → 'processing' に更新
    2. BullMQ に新しい document_parse ジョブを投入
    3. 旧ジョブがDLQにあれば削除
  Response: { data: { jobId, status: 'queued' } }
  認可: documents:upload
  監査ログ: action='retry_parse'
```

#### 2.6.5 ステータス確認 API

**新規ファイル:**
- `src/app/api/v1/documents/[id]/status/route.ts` — GET: ポーリング用

**設計:**
```
GET /api/v1/documents/:id/status
  Response: {
    data: {
      status: DocumentStatus,
      progress: number | null,  // 0-100 (ジョブ進捗)
      error_message: string | null,
      updated_at: string
    }
  }
  認可: documents:view
  ※フロントエンドからのポーリング用（3秒間隔推奨）
```

---

### Step 7: フロントエンド (WBS 3.1.1 + 3.1.6)

#### 2.7.1 証憑アップロードUI

**新規ファイル:**
- `src/app/(dashboard)/documents/page.tsx` — 証憑一覧ページ
- `src/components/documents/document-upload.tsx` — アップロードコンポーネント
- `src/components/documents/document-dropzone.tsx` — D&D ドロップゾーン

**設計:**
```
DocumentUploadコンポーネント:
- ドラッグ&ドロップ対応（HTML5 Drag and Drop API）
- 一括アップロード（複数ファイル選択）
- モバイル対応: ファイル選択ボタン + カメラ撮影
- アップロード進捗バー（各ファイル）
- 対応形式: PDF, JPG, PNG, WebP, TIFF
- 10MBサイズ制限のクライアントサイドバリデーション
- アップロード完了 → 自動で enqueue-parse API 呼び出し
- Idempotency-Key 自動付与（UUID v4）

フロー:
  ファイルD&D → クライアントバリデーション → POST /documents/upload
  → 成功 → POST /documents/:id/enqueue-parse → 一覧に追加
  → 失敗 → エラートースト表示
```

#### 2.7.2 証憑一覧画面

**新規ファイル:**
- `src/components/documents/document-list.tsx` — 一覧テーブル
- `src/components/documents/document-filters.tsx` — フィルタパネル
- `src/components/documents/document-status-badge.tsx` — 状態バッジ

**設計:**
```
一覧テーブル (DataTable ベース):
- カラム: ファイル名 | 種別 | 日付 | 金額 | 状態 | アップロード日
- 状態バッジ:
  - uploaded: グレー「アップロード済」
  - processing: 青アニメーション「処理中」
  - extracted: 緑「抽出完了」
  - verified: 緑チェック「検証済」
  - error: 赤「エラー」
- フィルタ: 状態、種別、期間、金額範囲
- ソート: 日付、金額、作成日
- ページネーション: 20件/ページ
- processing 状態の行は 5秒間隔でステータスポーリング

操作:
- 行クリック → 詳細ページ
- アクション列: リトライ(error時)、削除
```

#### 2.7.3 証憑詳細ページ

**新規ファイル:**
- `src/app/(dashboard)/documents/[id]/page.tsx` — 詳細ページ
- `src/components/documents/document-detail.tsx` — 詳細表示
- `src/components/documents/extraction-view.tsx` — 抽出結果表示
- `src/components/documents/document-preview.tsx` — ファイルプレビュー

**設計:**
```
2カラムレイアウト:
  左: ファイルプレビュー
    - PDF: <iframe> or PDF.js
    - 画像: <img> (Supabase Storage signed URL)
  右: メタデータ + 抽出結果
    - 基本情報: ファイル名、種別、状態、アップロード者、日時
    - 抽出結果（extracted_json の表示）:
      - 発行者名、宛先、日付、金額、税額
      - 登録番号 (T+13桁)
      - 税率別内訳テーブル
      - 明細行テーブル
      - 信頼度表示 (confidence バー)
    - 重複疑い警告（該当時のみ）
    - エラー情報（error 時）
      - エラーメッセージ
      - リトライボタン
```

#### 2.7.4 処理失敗リトライUI (WBS 3.1.6)

**実装場所:** 一覧画面 + 詳細ページ内に統合

**設計:**
```
一覧画面:
- error 状態の行にリトライアイコンボタン表示
- クリック → POST /documents/:id/retry → 状態更新

詳細ページ:
- error 時: エラーバナー表示
  - エラーメッセージ
  - 「再処理」ボタン（enqueue-parse再呼び出し）
  - 「再アップロード」ボタン（ファイル差替えダイアログ）

トースト通知:
- リトライ成功: 「OCR処理を再開しました」
- リトライ失敗: 「再処理の開始に失敗しました: {message}」
```

---

## 3. ファイル一覧（新規作成 + 変更）

### 新規作成ファイル（27ファイル）

| # | パス | 種別 | 対応WBS |
|---|------|------|---------|
| **共通インフラ** ||||
| 1 | `src/lib/queue/connection.ts` | Redis接続 | 3.1.2 |
| 2 | `src/lib/queue/queues.ts` | キュー定義 | 3.1.2 |
| 3 | `src/lib/queue/enqueue.ts` | enqueueヘルパー | 3.1.2 |
| 4 | `src/lib/di/client.ts` | Azure DI クライアント | 3.1.2 |
| 5 | `src/lib/llm/client.ts` | Claude API クライアント | 3.1.3/3.1.4 |
| 6 | `src/lib/validators/documents.ts` | Zod スキーマ | 3.1.1 |
| **Worker** ||||
| 7 | `worker/package.json` | Worker依存定義 | 3.1.2 |
| 8 | `worker/tsconfig.json` | Worker TS設定 | 3.1.2 |
| 9 | `worker/Dockerfile` | ACA Jobs用 | 3.1.2 |
| 10 | `worker/src/index.ts` | エントリーポイント | 3.1.2 |
| 11 | `worker/src/lib/supabase.ts` | Worker用DBクライアント | 3.1.2 |
| 12 | `worker/src/jobs/document-parse.ts` | OCR ジョブ本体 | 3.1.2 |
| 13 | `worker/src/jobs/structuring.ts` | 抽出データ構造化 | 3.1.3 |
| 14 | `worker/src/jobs/classification.ts` | 文書分類 | 3.1.4 |
| 15 | `worker/src/jobs/duplicate-check.ts` | 重複検知(OCR後) | 3.1.5 |
| **API Routes** ||||
| 16 | `src/app/api/v1/documents/route.ts` | 一覧API | 3.1.1 |
| 17 | `src/app/api/v1/documents/[id]/route.ts` | 詳細API | 3.1.1 |
| 18 | `src/app/api/v1/documents/[id]/enqueue-parse/route.ts` | OCR開始API | 3.1.2 |
| 19 | `src/app/api/v1/documents/[id]/retry/route.ts` | リトライAPI | 3.1.6 |
| 20 | `src/app/api/v1/documents/[id]/status/route.ts` | ステータスAPI | 3.1.2 |
| **Frontend** ||||
| 21 | `src/app/(dashboard)/documents/page.tsx` | 証憑一覧ページ | 3.1.1 |
| 22 | `src/app/(dashboard)/documents/[id]/page.tsx` | 証憑詳細ページ | 3.1.1 |
| 23 | `src/components/documents/document-upload.tsx` | アップロードUI | 3.1.1 |
| 24 | `src/components/documents/document-list.tsx` | 一覧テーブル | 3.1.1 |
| 25 | `src/components/documents/document-detail.tsx` | 詳細表示 | 3.1.1 |
| 26 | `src/components/documents/extraction-view.tsx` | 抽出結果表示 | 3.1.3 |
| 27 | `src/components/documents/document-status-badge.tsx` | 状態バッジ | 3.1.1 |

### 既存ファイルの変更（3ファイル）

| # | パス | 変更内容 |
|---|------|---------|
| 1 | `src/app/api/v1/documents/upload/route.ts` | アップロード成功後に自動で `enqueue-parse` を呼ぶオプション追加（`auto_parse=true` クエリ） |
| 2 | `src/types/database.ts` | `DiAnalyzeResult`, `StructuredExtraction` 型追加 |
| 3 | `.env.example` | 不足があれば補完（現状は全キー定義済み） |

---

## 4. DB変更

**本WBSでのスキーマ変更は不要。**

既存テーブルで全要件をカバー:
- `documents` — ファイルメタ + status + document_type + 金額等
- `document_extractions` — extracted_json (JSONB) に構造化データ格納
- `invoice_checks` — 後続Sprint (3.2) で使用

※ `idempotency_key` カラムは upload API で既に参照されているため、DDL上に存在することを確認する。未定義の場合は migration を追加。

---

## 5. テスト計画

### 単体テスト（Vitest）

| # | テスト対象 | ファイル | テスト内容 |
|---|-----------|---------|-----------|
| 1 | DI フィールドマッピング | `__tests__/lib/di/client.test.ts` | モックDIレスポンス → 構造化データ変換 |
| 2 | 抽出データ構造化 | `__tests__/worker/structuring.test.ts` | 各種入力パターン → 統一JSON |
| 3 | 文書分類ロジック | `__tests__/worker/classification.test.ts` | ルールベース分類の正確性 |
| 4 | 重複検知ロジック | `__tests__/worker/duplicate-check.test.ts` | 日付+金額マッチング |
| 5 | Zodバリデーション | `__tests__/lib/validators/documents.test.ts` | クエリパラメータバリデーション |
| 6 | enqueue ヘルパー | `__tests__/lib/queue/enqueue.test.ts` | ジョブ投入の冪等性 |

### 結合テスト（API）

| # | テスト対象 | テスト内容 |
|---|-----------|-----------|
| 1 | GET /documents | フィルタ、ページネーション、認可 |
| 2 | GET /documents/:id | 詳細取得、テナント分離 |
| 3 | POST /documents/:id/enqueue-parse | 状態遷移、ジョブ投入 |
| 4 | POST /documents/:id/retry | error状態のみ許可 |

---

## 6. 実装順序とチェックポイント

```
Phase A: 共通インフラ (Step 1)
  □ Redis接続テスト成功
  □ BullMQ キュー定義完了
  □ Azure DI クライアント実装 + 型定義
  □ Claude API クライアント実装
  □ 4-point check パス (lint/tsc/test/build)

Phase B: Worker基盤 (Step 2)
  □ Worker package.json / tsconfig.json / Dockerfile
  □ document_parse ジョブ骨格実装
  □ Supabase Storage → Azure DI → DB保存 フロー確認
  □ retry / DLQ 動作確認

Phase C: 構造化 + 分類 (Step 3-4)
  □ DI レスポンス → 構造化JSON 変換
  □ 登録番号(T+13桁)抽出テスト
  □ 日付正規化テスト (令和 → 西暦)
  □ 文書分類 (ルールベース + Claude API)
  □ 単体テスト全パス

Phase D: 重複検知強化 (Step 5)
  □ 日付+金額 近似チェック実装
  □ 重複候補の記録

Phase E: API Routes (Step 6)
  □ GET /documents 一覧API
  □ GET /documents/:id 詳細API
  □ POST /documents/:id/enqueue-parse
  □ POST /documents/:id/retry
  □ GET /documents/:id/status
  □ Zodバリデーション + 認可テスト

Phase F: フロントエンド (Step 7)
  □ D&Dアップロード → 自動OCR開始
  □ 一覧画面: 状態バッジ + フィルタ + ページネーション
  □ 詳細画面: プレビュー + 抽出結果
  □ リトライUI: エラー表示 + 再処理ボタン
  □ モバイルレスポンシブ対応

Phase G: 統合確認
  □ E2E: PDF/JPG アップロード → OCR → 抽出表示 の全フロー
  □ エラーケース: 大ファイル拒否、重複検知、OCR失敗→リトライ
  □ 4-point check 最終パス (lint/tsc/test/build)
```

---

## 7. 安全柵・制約事項（技術設計書 07 準拠）

| 制約 | 対応 |
|------|------|
| Azure DI POST 15TPS | BullMQ limiter `{ max: 15, duration: 1000 }` |
| DI ポーリング >= 2秒 | `await sleep(2000)` + Retry-After ヘッダ |
| 429 exponential backoff | DI クライアント内で実装 (2s→4s→8s→16s→32s) |
| ACA 240秒タイムアウト | Worker ジョブ timeout: 240000ms |
| ファイル 10MB上限 | クライアント + サーバー双方でチェック (既存) |
| 冪等性 | jobId = `doc_parse:${documentId}` で重複投入防止 |
| テナント分離 | 全クエリに tenant_id フィルタ + RLS |
| 改ざん検知 | SHA-256 ハッシュ (既存) |
| 失敗時 DLQ | BullMQ failed ジョブ保持 + UI表示 |

---

## 8. 環境変数（既存で十分）

```env
# 全て .env.example に定義済み
AZURE_DI_ENDPOINT=https://xxx.cognitiveservices.azure.com/
AZURE_DI_KEY=xxx
AZURE_REDIS_HOST=xxx.redis.cache.windows.net
AZURE_REDIS_PORT=6380
AZURE_REDIS_KEY=xxx
ANTHROPIC_API_KEY=sk-ant-xxx
LLM_MODEL=claude-sonnet-4-5-20250929
```

---

## 9. 依存パッケージ（追加インストール）

```bash
# メインアプリ — 追加不要（bullmq, ioredis は既にインストール済み）

# Worker 側
cd worker
pnpm init
pnpm add bullmq ioredis @supabase/supabase-js tsx
pnpm add -D typescript @types/node
```

**注:** `@anthropic-ai/sdk` は Claude API 呼び出しに必要。メインアプリ側に追加。

```bash
# メインアプリ
pnpm add @anthropic-ai/sdk
```

---

## 10. WBS要件トレーサビリティ

| 要件ID | 要件 | 対応Step | 対応ファイル |
|--------|------|---------|------------|
| ACC-001 | 証憑取込(Web) | Step 7 | document-upload.tsx, upload/route.ts |
| ACC-006 | 帳簿データ自動生成 | Step 2-3 | document-parse.ts, structuring.ts |
| ACC-015 | 文書自動分類 | Step 4 | classification.ts |
| ACC-020 | 重複証憑検知 | Step 5 | duplicate-check.ts, upload/route.ts |
| CMN-008 | 原本保管(S3互換) | 既存 | upload/route.ts (Supabase Storage) |
| CMN-009 | 改ざん検知(SHA-256) | 既存 | upload/route.ts (SHA-256) |

---

## 11. MVP逸脱事項（Phase 2送り）

| ID | 項目 | 理由 |
|----|------|------|
| D-1 | メール転送取込 | WBS記載通りPhase 2。IMAP/webhook基盤が必要 |
| — | WebSocket/SSE リアルタイム通知 | ポーリング方式で代替。Phase 2 でSSE検討 |
