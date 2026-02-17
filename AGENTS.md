# AI Business Accounting OS - Project Rules

## Project Overview

AI業務代替型 会計中核プラットフォーム（インボイス制度完全対応）。
中小零細企業（10〜50名規模）向けに、会計・受発注・決裁・経営分析をAIで代替する業務基盤ソフトウェア。

## Architecture

- Modular monolith with async AI workers
- Next.js 15 App Router (REST API via Route Handlers)
- React 19 + Tailwind CSS 4 + shadcn/ui
- Supabase (Auth + PostgreSQL + Storage + RLS)
- BullMQ + Azure Redis for job queue
- Azure Container Apps Jobs for workers

### Directory Structure

```
src/
  app/                    # Next.js App Router pages
    api/v1/               # REST API routes
    (auth)/               # Auth pages (login, signup)
    (dashboard)/          # Protected dashboard pages
  components/
    ui/                   # shadcn/ui components
  lib/
    supabase/
      client.ts           # Browser Supabase client
      server.ts           # Server Supabase client (cookies)
    queue/                # BullMQ queue definitions
    di/                   # Azure Document Intelligence client
    llm/                  # Claude API client
    auth/                 # Auth helpers
  types/                  # Shared TypeScript types
  hooks/                  # React hooks
  utils/                  # Utility functions
worker/                   # BullMQ consumer (ACA Jobs)
supabase/
  migrations/             # DDL migrations
```

## Coding Standards

- TypeScript strict mode
- Zod for all input validation
- All API routes under /api/v1/
- Use Supabase RLS for tenant isolation (never bypass in client code)
- service_role key is WORKER-ONLY (never expose to client)
- `any` 禁止。やむを得ない場合は `unknown` + type guard

### Naming Conventions

- ファイル名: `kebab-case` (例: `journal-drafts.ts`)
- コンポーネント: `PascalCase` (例: `JournalDraftList.tsx`)
- 変数・関数: `camelCase`
- DB関連の型/変数: スネークケース可（Supabase型生成に合わせる）
- 定数: `UPPER_SNAKE_CASE`

### Import Order

1. React / Next.js
2. External libraries
3. `@/lib/*`
4. `@/components/*`
5. `@/hooks/*`, `@/utils/*`, `@/types/*`
6. Relative imports

## Commands

- `pnpm dev` - Start dev server
- `pnpm build` - Production build
- `pnpm test` - Run Vitest
- `pnpm lint` - ESLint
- `pnpm tsc --noEmit` - Type check

## Database

- 25 tables (4 master + 21 business)
- All business tables have tenant_id + RLS
- audit_logs: INSERT only (no UPDATE/DELETE)
- AI outputs stored as JSONB
- Primary keys: uuid (gen_random_uuid())
- Master tables: `m_` prefix. Detail tables: `_lines` suffix
- `updated_at` は moddatetime トリガーで自動更新

## API Design

- All endpoints under `/api/v1/`
- Error format: `{ "error": { "code": "...", "message": "...", "details": [...] } }`
- 冪等性: `Idempotency-Key` ヘッダ (documents/upload, journals/confirm)
- 認可は RLS + アプリ側 RBAC で二重化

## Security Rules

- テナント分離: 全テーブルに tenant_id + RLS
- service_role key: Worker のみ。絶対にクライアントコードに含めない
- 証憑改ざん検知: SHA-256 ハッシュ
- 認証: Supabase Auth (Email + TOTP MFA + Google OAuth)
- RBAC: 3ロール (admin / accounting / viewer)
- 証憑保持: 電子帳簿保存法に準じ最低7年

## Testing

- Unit: Vitest + Testing Library
- E2E: Playwright
- Always run 4-point check: lint → typecheck → test → build

## Development Workflow

### Commit Convention (Conventional Commits)

- `feat:` - 新機能
- `fix:` - バグ修正
- `refactor:` - リファクタリング
- `test:` - テスト追加/修正
- `chore:` - 設定/ツール/CI
- `docs:` - ドキュメント

### AI-Assisted Development Flow

1. チケット内容から計画のみを先に作成（コード変更禁止）
2. 計画レビュー後に実装
3. 実装後は必ず 4-point check を実行
4. `git diff --stat` で差分レビュー
5. コミット & push → PR

## Key Reference Documents

設計判断に迷った場合は `Claude_Code_Document/` ディレクトリ内を参照:

- 要件定義書 / WBS (V8) / DB設計書 / 技術設計書
- メイン統一手順書 / コピペ用テンプレート集
