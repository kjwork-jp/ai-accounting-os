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
    (auth)/               # Auth pages (login, signup, onboarding)
    (dashboard)/          # Protected dashboard pages (tenant membership required)
  components/
    ui/                   # shadcn/ui components
    layouts/              # Dashboard layout, sidebar, header
  lib/
    supabase/
      client.ts           # Browser Supabase client
      server.ts           # Server Supabase client (session + admin)
    queue/                # BullMQ queue definitions
    di/                   # Azure Document Intelligence client
    llm/                  # Claude API client
    auth/
      helpers.ts          # getCurrentTenantUser, hasPermission, RBAC
    api/
      helpers.ts          # requireAuth, requireRole, response helpers
    audit/
      logger.ts           # Audit log insertion (direct insert + actor/entity name resolution)
  types/
    database.ts           # All 26 table types + enums
  hooks/                  # React hooks
  utils/                  # Utility functions
worker/                   # BullMQ consumer (ACA Jobs)
supabase/
  migrations/             # DDL migrations
  seed.sql                # Master data + dev tenant
```

## Coding Standards

- TypeScript strict mode
- Zod for all input validation
- All API routes under /api/v1/
- Use Supabase RLS for tenant isolation
- `any` 禁止。やむを得ない場合は `unknown` + type guard

### Supabase Client Usage

| Client | 関数名 | 用途 |
|--------|--------|------|
| Session (anon_key + cookies) | `createServerSupabase()` | 認証確認、ユーザーセッション管理 |
| Admin (service_role key) | `createAdminSupabase()` | API データクエリ（requireAuth 後）、signup |
| Browser (anon_key) | `createClient()` | クライアントサイド認証操作 |

> service_role key は API Route Handler 内（認証確認済みの後）および signup/worker で使用。
> クライアントサイドコード（`'use client'` ファイル）には絶対に含めない。

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

- 26 tables (4 master + 22 business)
- All business tables have tenant_id + RLS
- audit_logs: INSERT only (no UPDATE/DELETE)
- AI outputs stored as JSONB
- Primary keys: uuid (gen_random_uuid())
- Master tables: `m_` prefix. Detail tables: `_lines` suffix
- `updated_at` は moddatetime トリガーで自動更新
- `tenant_custom_roles`: カスタムロール定義テーブル（26番目）

## Auth & Tenant Flow

### Signup → Onboarding → Dashboard

```
Signup (/signup)
  → auth user + profile 作成（テナント割当なし）
  → ログイン (/login)
  → テナント未所属 → オンボーディング (/onboarding)
    → テナント作成 → admin ロールで割当 → /dashboard
    → 既存テナントへの招待待ち → 管理者が追加 → /dashboard
```

### Role Assignment Rules

| シナリオ | 割り当てロール |
|----------|---------------|
| テナント作成者 | `admin` |
| 管理者がユーザー追加 | `viewer`（デフォルト、変更可能） |
| カスタムロール割当 | `base_role` + 追加権限 |

## API Design

- All endpoints under `/api/v1/`
- Error format: `{ "error": { "code": "...", "message": "...", "details": [...] } }`
- 冪等性: `Idempotency-Key` ヘッダ (documents/upload, journals/confirm)
- 認可は RLS + アプリ側 RBAC で二重化

### Auth-related Endpoints

| Method | Path | 認証 | 説明 |
|--------|------|------|------|
| POST | `/api/v1/auth/signup` | 不要 | ユーザー登録 |
| POST | `/api/v1/auth/logout` | 必要 | ログアウト |
| POST | `/api/v1/tenants` | 認証のみ | テナント作成（テナント未所属でもOK） |
| GET | `/api/v1/me` | 必要 | 自分の情報 |

### Middleware Path Categories

| カテゴリ | パス | 説明 |
|----------|------|------|
| PUBLIC_PATHS | `/login`, `/signup`, `/auth/callback` | 認証不要 |
| API_PUBLIC_PATHS | `/api/v1/health`, `/api/v1/auth/signup` | 認証不要 API |
| AUTH_ONLY_PATHS | `/onboarding` | 認証必要、テナント不要 |
| API_AUTH_ONLY_PATHS | `/api/v1/tenants` | 認証必要、テナント不要 API |
| それ以外 | `/dashboard`, `/settings`, etc. | 認証＋テナント必要 |

## RBAC (Role-Based Access Control)

### Base Roles (5種)

| ロール | 説明 |
|--------|------|
| `admin` | 全権限 |
| `accounting` | 経理業務 |
| `viewer` | 閲覧のみ |
| `approver` | 承認業務 |
| `sales` | 営業業務 |

### Custom Roles

テナントごとにカスタムロールを定義可能（`tenant_custom_roles` テーブル）。

- `base_role`: 基本権限セット
- `permissions`: 追加権限（JSONB配列）
- 有効権限 = ベースロール権限 ∪ カスタム追加権限

### Permission Strings

```
users:manage, tenant:settings, custom_roles:manage,
documents:upload, documents:view,
journals:confirm, journals:view,
partners:manage, partners:view,
orders:manage, invoices:manage,
approvals:create, approvals:approve, approvals:view,
reports:view, audit:view
```

## Audit Logging

全ての重要操作は `audit_logs` テーブルに記録される。

### insertAuditLog() の使い方

```typescript
await insertAuditLog({
  tenantId: result.auth.tenantId,
  actorUserId: result.auth.userId,   // 必須: 実行者ID
  action: 'create',                   // create/update/delete/disable
  entityType: 'tenant_users',         // テーブル名
  entityId: userId,                   // 対象ID
  entityName: '山田太郎',              // 省略可: 自動解決される
  diffJson: computeDiff(old, new),    // 省略可: 変更差分
  requestId: getRequestId(request),   // 省略可: リクエスト追跡ID
});
```

- `actorUserId` は必須。プロフィールから `actor_name` を自動解決。
- `entityName` は省略可。`entity_type` + `entity_id` から自動解決される。
- 対応エンティティ: `tenant_users`, `tenants`, `tenant_settings`, `tenant_custom_roles`, `partners`, `documents`

### 文書アップロード API

```
POST /api/v1/documents/upload
Content-Type: multipart/form-data
Idempotency-Key: <optional-uuid>

- 10MB上限
- SHA-256ハッシュ計算・重複検知
- Supabase Storage保存
- 対応形式: PDF, JPEG, PNG, WebP, TIFF, CSV, XLSX
```

## Security Rules

- テナント分離: 全テーブルに tenant_id + RLS
- service_role key: API Route Handler（認証後）+ Worker + Signup
- 証憑改ざん検知: SHA-256 ハッシュ
- 認証: Supabase Auth (Email + TOTP MFA + Google OAuth)
- 証憑保持: 電子帳簿保存法に準じ最低7年
- セキュリティ要件マッピング: `docs/sec-mapping.md`

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

## Notifications

- `sonner` (shadcn/ui Sonner) を使用
- `<Toaster />` はルートレイアウトに配置済み
- 使い方: `import { toast } from 'sonner'; toast.success('保存しました');`

## Key Reference Documents

設計判断に迷った場合は `Claude_Code_Document/` ディレクトリ内を参照:

- 要件定義書 / WBS (V8) / DB設計書 / 技術設計書
- メイン統一手順書 / コピペ用テンプレート集

### docs/ ディレクトリ

| ファイル | 内容 |
|---------|------|
| `S0-review-and-S1-plan.md` | S0完了レビュー + S1〜S6実施手順書 |
| `DB-007_マスタデータ投入.md` | マスタデータ Seed 仕様 |
| `verification-guide.md` | S1機能検証チェックリスト |
| `sec-mapping.md` | SEC-001〜005 セキュリティ要件マッピング |
| `backup-restore.md` | バックアップ・リストア手順書 |
| `monitoring.md` | 監視設計書 |
