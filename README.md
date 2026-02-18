# AI Business Accounting OS

MVP repository for AI-powered accounting platform.

## Tech Stack

- Next.js 15 (App Router) + React 19
- Supabase (Auth, PostgreSQL, Storage, RLS)
- Azure (Document Intelligence, Redis, Container Apps)
- Claude API (Sonnet)
- Tailwind CSS 4 + shadcn/ui

## Getting Started

```bash
pnpm install
pnpm dev
```

## Environment

Copy `.env.example` to `.env.local` and fill in values.

## Quality Gate

```bash
pnpm lint && pnpm tsc --noEmit && pnpm test && pnpm build
```
