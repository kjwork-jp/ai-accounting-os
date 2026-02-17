# AI Business Accounting OS - Project Rules

## Architecture

- Modular monolith with async AI workers
- Next.js 14+ App Router (REST API via Route Handlers)
- Supabase (Auth + PostgreSQL + Storage + RLS)
- BullMQ + Azure Redis for job queue
- Azure Container Apps Jobs for workers

## Coding Standards

- TypeScript strict mode
- Zod for all input validation
- All API routes under /api/v1/
- Use Supabase RLS for tenant isolation (never bypass in client code)
- service_role key is WORKER-ONLY (never expose to client)

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

## Testing

- Unit: Vitest + Testing Library
- E2E: Playwright
- Always run 4-point check: lint → typecheck → test → build
