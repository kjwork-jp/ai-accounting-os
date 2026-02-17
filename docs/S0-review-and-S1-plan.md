# S0完了レビュー & S1以降実施手順書

## 1. ドキュメント体系の整理

### 1.1 全ドキュメント一覧と役割

| # | ファイル名 | 役割 | シート数 |
|---|-----------|------|---------|
| 1 | 要件定義書.docx | 全102件の機能要件(CMN/ACC/SO/PO/APR/RPT/SEC/EXT) | 37テーブル |
| 2 | WBS.xlsx | V8: Sprint計画(S0-S6+Buffer=203h)、要件トレーサビリティ、逸脱一覧、技術スタック | 8シート |
| 3 | DB設計書.xlsx | 25テーブル/252カラム/89RLS/17INDEX、DDL完全版、Seed SQL | 12シート |
| 4 | 技術設計書.xlsx | スタック詳細/アーキテクチャ/44API/画面遷移/ジョブ設計/安全柵/モック分析 | 11シート |
| 5 | 実行順序ガイド.docx | Golden Path: Step0(Cleanup)→Step7(Verify)の順序定義 | - |
| 6 | メイン統一手順書.xlsx | DO/CHECKステップ形式の実行手順(Prepare〜Verify) | 10シート |
| 7 | コピペ用テンプレート集.xlsx | Artifact ID付きのコード/SQL/設定テンプレート(12件) | 2シート |
| 8 | トラブルシュート.xlsx | 症状→原因→解決の対応表(22件) | 1シート |
| 9 | クリーンアップ・ロールバック.xlsx | 環境リセット手順(16ステップ) | 1シート |
| 10 | サンプル手順・Copy_OK_List.xlsx | モック資産棚卸し、コピーOKリスト(12ファイル) | 3シート |
| 11 | シークレットキー管理台帳.xlsx | 16キーの取得元/格納先/漏洩影響/ローテ手順 | 1シート |
| 12 | コスト試算.xlsx | 月額サービス費用(Vercel/Supabase/Azure/Claude) | 2シート |
| 13 | 本番環境構築手順.xlsx | PROD環境のSTGとの差分構築手順(12ステップ) | 1シート |
| 14 | アーキテクチャ図5種.docx | Mermaid形式: 全体構成/画面遷移/ER図/シーケンス/ジョブ状態 | - |
| 15 | ai-accounting-os.zip | モックアップ資産(UI参考用) | - |

### 1.2 ドキュメント間の依存関係

```
要件定義書 (102件の機能要件)
  ↓ MVP/Phase2振り分け
WBS (必須要件トレーサビリティ: 81件MVP + 10件簡易 + 11件Phase2)
  ↓ 技術方針決定
技術設計書 (44API / 6ジョブ / 10画面 / 25テーブル)
  ↓ DB詳細化
DB設計書 (DDL 532行 / RLS 89ポリシー / INDEX 17本)
  ↓ 実行計画
実行順序ガイド → メイン統一手順書 (DO/CHECK形式)
  ↓ 補助
コピペ用テンプレート集 / トラブルシュート / シークレット台帳 / コスト試算
```

---

## 2. S0完了状況の照らし合わせ

### 2.1 WBS S0タスク vs 実績

| WBS ID | タスク | 工数 | 状態 | 根拠 |
|--------|-------|------|------|------|
| **1.1 MVP要件・設計** |||||
| 1.1.1 | 要件分析+トレーサビリティ | 2h | **完了** | WBS「必須要件トレーサビリティ」シート(102件仕分け済み) |
| 1.1.2 | 技術スタック確定 | 1h | **完了** | WBS「技術スタック」シート + 技術設計書01 |
| 1.1.3 | 画面遷移・API設計 | 3h | **完了** | 技術設計書03(44API)/05(10画面) |
| 1.1.4 | MVP設計方針書 | 1h | **完了** | WBS「要件9章_MVP方針」+ 技術設計書10 |
| 1.1.5 | モック資産分析 | 1h | **完了** | 技術設計書08 + サンプル手順 |
| 1.1.6 | 同期処理安全柵仕様 | 1h | **完了** | 技術設計書07 |
| **1.2 DB設計** |||||
| 1.2.1 | スキーマ設計(DDL) | 3h | **完了(設計のみ)** | DB設計書03-05(DDL 532行)。ただしmigrationファイル未commit |
| 1.2.2 | RLSポリシー | 1h | **完了(設計のみ)** | DB設計書04(89ポリシー)。Supabaseへ未適用 |
| 1.2.3 | マスタデータ+Seed | 1h | **完了(設計+ファイル)** | DB設計書06-07 + `supabase/seed.sql`(110行) |
| **1.3 インフラ** |||||
| 1.3.1 | Supabase構築 | 1h | **進行中** | メイン手順書Supabaseシート"In progress"。キー取得済み |
| 1.3.2 | Azure DI+Redis設定 | 2h | **完了** | メイン手順書Azure_DI_Redisシート"Done"。キー取得済み |
| 1.3.3 | CI/CD | 2h | **部分完了** | GitHub Actions ci.yml存在。Vercel連携済み。ACA/ACR構築は"Blocked" |

### 2.2 メイン統一手順書シート別ステータス

| シート | ステータス | 詳細 |
|--------|----------|------|
| Prepare | **Done** | ツールインストール/SSH/リポジトリ構築完了 |
| Supabase | **In progress** | Project作成/Auth/Storage設定途中 |
| Azure_DI_Redis | **Done** | RG/DI/Redis作成+キー取得完了 |
| CI_CD | **Blocked** | Vercel連携済みだがACA/ACR構築がブロック中 |
| Coding | **部分完了** | Next.js初期化/依存/ディレクトリ構造OK。設定ファイル一部未完 |
| DB | **未着手** | DDL/RLS/トリガー/Seed/StorageRLSすべて未実行 |
| Verify | **未着手** | 全チェック項目未実施 |

### 2.3 リポジトリ内の実装状況

| カテゴリ | 設計書上の想定 | 現状 | ギャップ |
|---------|-------------|------|---------|
| **プロジェクト基盤** | Next.js 14+ App Router | Next.js 15 + React 19 (**OK、上位互換**) | なし |
| **UI** | shadcn/ui + Tailwind | shadcn/ui設定済み、button.tsx のみ | 共通コンポーネント未作成(S1タスク) |
| **API** | 44エンドポイント | ディレクトリ構造のみ(.gitkeep) | route.ts ファイルが0個 |
| **DB migration** | DDL 532行 + RLS 89行 | `supabase/migrations/.gitkeep`のみ | **migration SQLファイル未commit** |
| **Seed** | マスタ+テナント+科目 | `supabase/seed.sql` (110行) | **OK** (DB設計書と一致) |
| **Supabase Client** | Browser + Server | `client.ts` + `server.ts` | **OK** |
| **Auth middleware** | RLS + RBAC二重化 | middleware.ts 未作成 | S1で実装予定 |
| **Worker** | BullMQ consumer | `worker/src/` スケルトンのみ | S2で実装予定 |
| **テスト** | Vitest + Playwright | smoke.test.ts (1件) | S1以降で拡充 |
| **CI** | lint→typecheck→test→build | ci.yml 設定済み | **OK** |
| **ドキュメント** | AGENTS.md | 134行、設計判断と規約を記載 | **OK** |

### 2.4 重要なギャップ(S1着手前に解決すべき)

| # | ギャップ | 影響度 | 解決策 |
|---|---------|--------|--------|
| G-1 | **DB migrationファイルが未commit** | 高 | DB設計書05_DDLをmigrationファイルとしてcommit |
| G-2 | **DB手順書(DB-001〜DB-012)が未実施** | 高 | Supabase SQL EditorでDDL/RLS/トリガー/Seedを実行 |
| G-3 | **CI_CDシートがBlocked** | 中 | ACA/ACRはS2(Worker実装時)まで延期可。Vercelデプロイは動作中 |
| G-4 | **Supabaseシートが未完了** | 中 | MFA設定/Storage bucket作成/Extension有効化を完了させる |
| G-5 | **Verifyシートが未実施** | 中 | DB構築後にインフラ疎通〜ビルド確認を実施 |

---

## 3. S1以降の実施手順書

### 3.0 S0残タスク(S1着手前に完了させる)

> **目標**: DB構築完了 + 全インフラ疎通確認

| Step | ID | タスク | 手順 | 確認方法 |
|------|----|-------|------|---------|
| 1 | S0-R1 | Supabase Extensions有効化 | SQL Editor: `CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS moddatetime;` | `SELECT * FROM pg_extension;` にpgcrypto/moddatetimeが存在 |
| 2 | S0-R2 | DDL実行(25テーブル作成) | DB設計書05_DDL_PostgreSQLの完全SQLをSQL Editorで実行 | `SELECT count(*) FROM information_schema.tables WHERE table_schema='public';` → 25 |
| 3 | S0-R3 | RLSポリシー適用 | DB設計書04_RLSポリシーのSQLを実行(is_tenant_member関数 + 89ポリシー) | `SELECT count(*) FROM pg_policies WHERE schemaname='public';` → 89前後 |
| 4 | S0-R4 | moddatetimeトリガー作成 | メイン手順書DB-005のPL/pgSQL実行 | `SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE trigger_name='set_updated_at';` |
| 5 | S0-R5 | マスタデータ投入 | seed.sqlをSQL Editorで実行 | m_document_types:7件、m_tax_codes:4件、m_accounts:35件 |
| 6 | S0-R6 | INDEXEs作成 | DB設計書10_性能・インデックスのCREATE INDEX SQL実行 | `SELECT indexname FROM pg_indexes WHERE schemaname='public';` |
| 7 | S0-R7 | Storage RLS | メイン手順書DB-011のpolicy SQL実行 | `SELECT policyname FROM pg_policies WHERE tablename='objects';` |
| 8 | S0-R8 | DB migrationファイルcommit | DDL/RLS/Trigger/Seed/IndexのSQLを`supabase/migrations/`配下にファイルとして格納 | ファイル存在 |
| 9 | S0-R9 | Verify実行 | メイン手順書Verifyシート(VER-001〜VER-012)を順に実行 | 全項目パス |

---

### 3.1 Sprint S1: 共通基盤開発 (27h)

> **ゴール**: 認証(MFA)完動 / ユーザー管理動作 / FE基盤完成 / SEC文書化完了

#### Phase 1: 認証・ユーザー管理 (WBS 2.1)

| Step | WBS | タスク | 実装内容 | 成果物 | 工数 |
|------|-----|-------|---------|--------|------|
| S1-01 | 2.1.1 | Supabase Auth(メール認証) | `src/app/(auth)/login/page.tsx`, `signup/page.tsx`。Supabase Auth UIまたはカスタムフォーム。`src/middleware.ts`でセッション検証+リダイレクト | ログイン/ログアウト/セッション管理動作 | 2h |
| S1-02 | 2.1.1 | Auth APIルート | `src/app/api/v1/auth/logout/route.ts`, `src/app/api/v1/me/route.ts` 実装 | 認証API | (S1-01に含む) |
| S1-03 | 2.1.2 | TOTP MFA | Supabase MFA API連携。MFA登録UI(`/settings`内)＋ログイン時のTOTP入力画面 | MFA機能 | 2h |
| S1-04 | 2.1.3 | Google OAuth | Supabase Auth Providers設定。ログイン画面にOAuthボタン追加 | OAuth動作 | 1h |
| S1-05 | 2.1.4 | ロール管理(3ロール) | `tenant_users.role`に基づくRBACヘルパー(`src/lib/auth/rbac.ts`)。APIミドルウェアでロールチェック | admin/accounting/viewer | 2h |
| S1-06 | 2.1.5 | テナント分離(RLS) | テナントコンテキスト取得(`src/lib/auth/tenant.ts`)。`is_tenant_member`関数はDB側で実装済み。アプリ側で`tenant_id`を常に付与する設計 | テナント分離動作確認 | 2h |
| S1-07 | 2.1.6 | ユーザー管理画面 | `src/app/(dashboard)/settings/users/page.tsx`。ユーザー一覧/作成/編集/無効化。`src/app/api/v1/users/route.ts`、`[userId]/route.ts`、`[userId]/disable/route.ts` | ユーザー管理画面+API | 2h |

#### Phase 2: FE基盤 (WBS 2.2)

| Step | WBS | タスク | 実装内容 | 成果物 | 工数 |
|------|-----|-------|---------|--------|------|
| S1-08 | 2.2.1 | Next.js＋モックUI移植 | App Router構成確定。`(auth)/`と`(dashboard)/`のルートグループ。レスポンシブ対応。モックUIからshadcn/uiコンポーネントをコピー(Copy_OK_Listの12ファイル) | FEベース | 3h |
| S1-09 | 2.2.2 | 共通レイアウト | `src/components/layouts/dashboard-layout.tsx`(サイドバー+ヘッダー+メイン領域)。`src/app/(dashboard)/layout.tsx`で適用 | DashboardLayout | 2h |
| S1-10 | 2.2.3 | 共通コンポーネント | DataTable(ソート/ページネーション)、FormField、Modal/Dialog、Toast/Notification、SearchPanel。`src/components/ui/`配下 | 再利用可能UIコンポ群 | 2h |

#### Phase 3: API・データ基盤 (WBS 2.3)

| Step | WBS | タスク | 実装内容 | 成果物 | 工数 |
|------|-----|-------|---------|--------|------|
| S1-11 | 2.3.1 | API Route基盤 | API共通ヘルパー: 認証チェック、エラーハンドリング、Zodバリデーション、レスポンス形式統一。`src/lib/api/helpers.ts`。`/api/v1/health/route.ts`実装 | API基盤 | 2h |
| S1-12 | 2.3.2 | ファイルアップロード | `src/app/api/v1/documents/upload/route.ts`。Supabase Storage連携、SHA-256ハッシュ計算、10MBサイズ上限チェック、Idempotency-Key対応 | アップロードAPI | 2h |
| S1-13 | 2.3.3 | 監査ログ基盤 | `src/lib/audit/logger.ts`。`insert_audit_log` RPC呼び出し。API共通ミドルウェアで重要操作を自動記録。`src/app/api/v1/audit-logs/route.ts`(4キー検索) | 監査ログ | 2h |

#### Phase 4: セキュリティ・運用 (WBS 2.4)

| Step | WBS | タスク | 実装内容 | 成果物 | 工数 |
|------|-----|-------|---------|--------|------|
| S1-14 | 2.4.1 | SEC要件マッピング表 | SEC-001〜005のマネージド充足を文書化(`docs/sec-mapping.md`) | マッピング表 | 1h |
| S1-15 | 2.4.2 | BK・リストア手順書 | Supabase BK設定確認+手動リストア手順書(`docs/backup-restore.md`) | BK手順書 | 1h |
| S1-16 | 2.4.3 | 監視設計 | 監視項目一覧+アラート設定方針(`docs/monitoring.md`) | 監視設計書 | 1h |

#### S1 チェックポイント

```
□ メール認証でログイン/ログアウトができる
□ TOTP MFAの登録と認証ができる
□ Google OAuthでログインできる
□ 管理者がユーザーを作成/編集/無効化できる
□ 3ロール(admin/accounting/viewer)で画面アクセス制御が動作する
□ RLSで他テナントのデータが見えない
□ DashboardLayoutが表示される(サイドバー+ヘッダー)
□ /api/v1/health が {"ok":true} を返す
□ ファイルアップロードでStorage保存+SHA-256記録される
□ 重要操作がaudit_logsに記録される
□ 4-point check (lint/typecheck/test/build) が全パス
```

---

### 3.2 Sprint S2: 会計処理コア前半 (38h)

> **ゴール**: 証憑→AI仕訳→確定フロー動作

#### Phase 1: 証憑取込・OCR (WBS 3.1)

| Step | WBS | タスク | 実装内容 | 工数 |
|------|-----|-------|---------|------|
| S2-01 | 3.1.1 | 証憑アップロードUI | `/documents`ページ。D&D+一括+モバイル対応。処理状態(queued/running/succeeded/failed)のリアルタイム表示 | 3h |
| S2-02 | 3.1.2 | Azure DI連携+非同期Worker | `worker/src/jobs/document-parse.ts`。BullMQ consumer。DI制限対応(POST=15TPS/ポーリング>=2s/retry-after/429バックオフ)。`src/lib/di/client.ts`。ACA Jobs用Dockerfile | 8h |
| S2-03 | 3.1.3 | 抽出データ構造化 | OCR結果→帳簿要件マッピング。Claude API併用で日本語解析補完。`document_extractions`テーブルへJSONB保存 | 3h |
| S2-04 | 3.1.4 | 文書自動分類 | Claude APIで請求書/領収書/その他分類。`documents.document_type`更新 | 2h |
| S2-05 | 3.1.5 | 重複証憑検知 | SHA-256ハッシュ+日付+金額での重複チェック。警告UI | 1h |
| S2-06 | 3.1.6 | 処理失敗リトライUI | エラー表示+再アップロード+再enqueueボタン。DLQ表示 | 1h |

#### Phase 2: AI仕訳生成 (WBS 3.2)

| Step | WBS | タスク | 実装内容 | 工数 |
|------|-----|-------|---------|------|
| S2-07 | 3.2.1 | 仕訳候補生成エンジン | `worker/src/jobs/journal-suggest.ts`。Claude API呼び出し。Top3候補+信頼度+理由+SSEストリーミング。過去確定ルール優先ロジック。`src/lib/llm/client.ts` | 5h |
| S2-08 | 3.2.2 | 勘定科目マスタUI | `/accounts`での科目参照+選択UI。`src/app/api/v1/accounts/route.ts`実装 | 1h |
| S2-09 | 3.2.3 | 信頼度・閾値処理 | tenant_settingsから閾値取得。0.9↑自動確定候補/0.7-0.9確認/0.7↓保留の3段階分類 | 2h |
| S2-10 | 3.2.4 | 仕訳確認・修正UI | `/journals`ページ。候補Top3選択/手動修正/確定。修正履歴を`feedback_events`に蓄積。`journals/drafts/[id]/confirm/route.ts` | 4h |
| S2-11 | 3.2.5 | 証憑-仕訳紐付 | documents↔journal_entries のFK紐付け。UI上でトレーサビリティ表示 | 1h |

#### Phase 3: 取引先管理 (WBS 3.5)

| Step | WBS | タスク | 実装内容 | 工数 |
|------|-----|-------|---------|------|
| S2-12 | 3.5.1 | 取引先CRUD | `/partners`ページ+API。登録番号管理。`partners/route.ts`、`[id]/route.ts` | 3h |
| S2-13 | 3.5.2 | 名寄せ(簡易) | 完全一致+前方一致+カナ変換マッチング。`src/lib/partners/name-matching.ts` | 2h |
| S2-14 | 3.5.3 | 重複検知・統合 | 候補提示+手動統合UI。`partners/[id]/merge/route.ts` | 2h |

#### S2 チェックポイント

```
□ 証憑(PDF/JPG)をD&DでアップロードしOCR処理が走る
□ OCR結果がdocument_extractionsに保存される
□ 文書が自動分類(請求書/領収書/その他)される
□ 重複証憑が検知されて警告が出る
□ 仕訳候補Top3が生成され信頼度+理由が表示される
□ 閾値に基づく3段階分類(自動/確認/保留)が動作する
□ 仕訳を選択・修正・確定できる
□ 証憑と仕訳の紐付けが表示される
□ 取引先の登録/編集/名寄せ/統合ができる
□ 処理失敗時に再試行できる
```

---

### 3.3 Sprint S3: 会計処理コア後半 (24h)

> **ゴール**: 試算表出力可 / 電帳法検索OK / CSV取込OK

| Step | WBS | タスク | 実装内容 | 工数 |
|------|-----|-------|---------|------|
| S3-01 | 3.3.1 | 仕訳一覧・検索 | `/journals`の一覧ビュー。フィルタ/ソート/ページネーション。`journals/entries/route.ts` | 3h |
| S3-02 | 3.3.2 | 月次試算表 | 勘定科目別の借方/貸方残高集計+前月差。`reports/pl/route.ts`のベースロジック | 3h |
| S3-03 | 3.3.3 | 消費税集計 | 税率別(10%/8%/非課税)集計。invoice_lines基準 | 2h |
| S3-04 | 3.3.4 | CSVエクスポート | 仕訳CSV+試算表CSV。`journals/export/route.ts` | 1h |
| S3-05 | 3.4.1 | 銀行CSV取込 | `/payments`。汎用CSVパーサー+列マッピングUI。`payments/import/bank-csv/route.ts` | 3h |
| S3-06 | 3.4.2 | 明細-仕訳突合 | `match_bank_statement`ジョブ実装。自動マッチング。`reconciliations/suggest/route.ts` | 3h |
| S3-07 | 3.4.3 | クレカCSV取込 | 銀行CSV基盤拡張。`payments/import/cc-csv/route.ts` | 1h |
| S3-08 | 3.6.1 | 証憑検索UI(6キー) | 日付/金額/取引先/登録番号/税率/文書種別の複合検索。`documents/route.ts`のクエリ強化 | 3h |
| S3-09 | 3.6.2 | 検索DB最適化 | 複合INDEX確認+pg_trgm(必要なら)追加 | 1h |
| S3-10 | 3.7.1-3 | 既存会計CSV取込 | アップロード→プレビュー→手動列マッピング→取込。弥生/freee/MFテンプレート定義 | 4h |

---

### 3.4 Sprint S4: 受注・発注処理 (24h)

> **ゴール**: 請求書発行可 / 受発注フロー動作

| Step | WBS | タスク | 実装内容 | 工数 |
|------|-----|-------|---------|------|
| S4-01 | 4.1.1 | 受注登録 | `/sales-orders`。取引先/明細/税率CRUD。`orders/route.ts` | 3h |
| S4-02 | 4.1.2 | 適格請求書PDF | @react-pdf/renderer。インボイス全必須項目(発行者/登録番号/日付/内容/税率別対価/税額/受領者)。`invoices/route.ts` | 5h |
| S4-03 | 4.1.3 | 請求書発行・保存 | 発行+写し自動保存(Supabase Storage)+ステータス管理 | 2h |
| S4-04 | 4.1.4 | 売上仕訳自動生成 | 請求→journal_entries自動連動 | 2h |
| S4-05 | 4.1.5 | 入金消込(基本) | 金額一致+近似額+名寄せマッチング。`reconciliations/`実装 | 3h |
| S4-06 | 4.2.1 | 受領請求書・チェック | `/purchase-orders`。インボイス必須項目チェック。`invoice_validate`ジョブ | 3h |
| S4-07 | 4.2.2 | 買掛/未払仕訳 | 受領請求書→仕訳自動連動 | 2h |
| S4-08 | 4.2.3 | 支払予定表 | 期日順+重要度一覧 | 1h |
| S4-09 | 4.2.4 | 支払消込 | 銀行明細→支払突合 | 1h |
| S4-10 | 4.2.5 | 異常検知 | 二重計上/重複請求/金額不一致ルールベース検知 | 2h |

---

### 3.5 Sprint S5: 決裁・経営分析 (28h)

> **ゴール**: 決裁動作 / ダッシュボード表示 / 監査ログ検索動作

| Step | WBS | タスク | 実装内容 | 工数 |
|------|-----|-------|---------|------|
| S5-01 | 5.1.1 | 申請フォーム | `/approvals`。支払/経費/立替の統一フォーム+証憑添付。`approvals/route.ts` | 3h |
| S5-02 | 5.1.2 | 承認ルート自動 | 金額閾値ベースルーティング。`approvals/[id]/submit/route.ts` | 2h |
| S5-03 | 5.1.3 | 承認・差戻・却下 | 3アクション+コメント。`approve/route.ts`、`return/route.ts` | 2h |
| S5-04 | 5.1.4 | AI事前審査 | 金額異常/初回取引/形式チェック。`approval_risk_score`ジョブ | 3h |
| S5-05 | 5.1.5 | リスクスコア | ルールベーススコア(0-100)+理由表示 | 2h |
| S5-06 | 5.2.1 | ダッシュボードTOP | `/` KPIサマリー/アラート/チャート(Recharts) | 4h |
| S5-07 | 5.2.2 | 月次PL | `/analytics`内。前年差/前月差付きPL | 3h |
| S5-08 | 5.2.3 | 科目推移+科目分析 | Rechartsグラフ+ドリルダウン | 2h |
| S5-09 | 5.2.4 | 取引先別・未収未払 | 上位N件テーブル+期日別一覧 | 2h |
| S5-10 | 5.2.5 | AI変動要因サマリー | Claude API自然言語要約。`reports/generate/route.ts` | 2h |
| S5-11 | 5.2.6 | 異常アラート+過去比較 | 閾値ベースアラート+前年同月比較 | 1h |
| S5-12 | 5.2.7 | 監査ログ検索画面 | `/audit-logs`。4キー検索(期間/操作者/種別/対象) | 2h |

---

### 3.6 Sprint S6: テスト・リリース (27h)

> **ゴール**: MVPリリース完了

| Step | WBS | タスク | 実装内容 | 工数 |
|------|-----|-------|---------|------|
| S6-01 | 6.1.1 | 単体テスト | Vitest。API/ビジネスロジック/バリデーション | 4h |
| S6-02 | 6.1.2 | 結合テスト | Playwright。主要業務フローE2E(アップロード→仕訳→確定、請求書発行、決裁) | 4h |
| S6-03 | 6.1.3 | AI出力テスト | 仕訳精度(正答率)/分類精度の検証 | 3h |
| S6-04 | 6.2.1 | 統合動作確認 | 全画面遷移/全業務シナリオの手動テスト | 3h |
| S6-05 | 6.2.2 | バグ修正 | テスト発覚不具合修正 | 5h |
| S6-06 | 6.2.3 | 法令準拠確認 | インボイス制度/電帳法の網羅チェック | 2h |
| S6-07 | 6.2.4 | 認証/CSV/検索テスト | MFA+CSV取込+6キー検索の動作確認 | 1h |
| S6-08 | 6.3.1 | 本番環境 | 本番環境構築手順.xlsx に従いPROD構築 | 2h |
| S6-09 | 6.3.2 | データ移行テスト | Seed投入+動作確認 | 1h |
| S6-10 | 6.3.3 | 運用ドキュメント | マニュアル+BK/監視運用手順 | 2h |

---

## 4. Sprint実行時の標準ワークフロー

各Sprintのチケット実装時は、メイン統一手順書Recurring_Opsシートに従い以下を繰り返す。

```
1. [REC-001] git checkout main && git pull origin main
2. [REC-002] git checkout -b feature/<WBS-ID>
3. [REC-003] Claude Codeに計画作成を依頼(コード変更禁止)
   → ファイル一覧/DB/API/UI/テスト/コマンドの計画レビュー
4. [REC-004] 計画に従い実装
5. [REC-005] 品質チェック4点セット:
   pnpm lint && pnpm tsc --noEmit && pnpm test && pnpm build
6. [REC-006] git diff --stat で差分レビュー
7. [REC-007] git add -A && git commit -m "feat: ..." && git push
8. [REC-008] GitHub PR作成 → CIグリーン確認
9. [REC-009] Vercel Preview URLで手動疎通確認
```

---

## 5. 要件トレーサビリティサマリー

| 区分 | 要件数 | MVP実装 | 簡易+逸脱 | Phase2送り |
|------|--------|---------|----------|-----------|
| 共通(CMN) | 13 | 10 | 3 | 0 |
| 会計(ACC) | 23 | 18 | 4 | 1 |
| 受注(SO) | 14 | 9 | 0 | 5 |
| 発注(PO) | 13 | 10 | 1 | 2 |
| 決裁(APR) | 16 | 13 | 0 | 3 |
| 分析(RPT) | 20 | 14 | 0 | 6 |
| 付随(EXT) | 7 | 4 | 3 | 0 |
| セキュリティ(SEC) | 5 | 5 | 0 | 0 |
| **合計** | **102** | **81** | **10** | **11** |

Phase2送り(11件)は逸脱一覧D-7〜D-14として承認待ち。

---

## 6. 技術スタック確認

| 領域 | 設計書 | リポジトリ | 一致 |
|------|--------|----------|------|
| FE | Next.js 14+ | Next.js 15 | OK(上位互換) |
| UI | shadcn/ui + Tailwind | 設定済み | OK |
| チャート | Recharts | package.jsonに存在 | OK |
| API | REST(OpenAPI) | route構造のみ | 実装待ち |
| 認証 | Supabase Auth | client.ts/server.ts | OK(MFA/OAuth実装待ち) |
| DB | Supabase PostgreSQL | config.toml設定済み | OK(DDL適用待ち) |
| Queue | BullMQ + Azure Redis | package.jsonに存在 | OK(実装待ち) |
| Worker | ACA Jobs | worker/ディレクトリ存在 | OK(実装待ち) |
| OCR | Azure DI | キー取得済み | OK(実装待ち) |
| LLM | Claude API Sonnet | .env.exampleに定義 | OK(実装待ち) |
| テスト | Vitest + Playwright | package.jsonに存在 | OK |
| CI | GitHub Actions | ci.yml存在 | OK |
| PDF | @react-pdf/renderer | **未インストール** | S4で追加 |

---

*作成日: 2026-02-17*
*対象: WBS V8 / DB設計書 / 技術設計書 / メイン統一手順書との照合*
