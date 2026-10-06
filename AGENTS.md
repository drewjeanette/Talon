# AGENTS.md

Talon: Tennessee Tech payroll + web-clock. Cloudflare Workers (Hono) API + D1 (Drizzle) + React/Vite client served as Worker static assets. npm workspaces: `server/`, `client/`.

## Commands (repo root)
- `npm run dev` — full stack at http://localhost:8787 (local D1)
- `npm run typecheck` — must pass before committing
- `npm run build` — server typecheck + client build
- `npm run db:generate` — Drizzle migration from `server/src/db/schema.ts`
- `npm run db:migrate:local` / `db:seed:generate` / `db:seed:local`
- Never run `db:*:remote` or `deploy` unless explicitly asked.

## Layout
- `server/src/routes/*.routes.ts` — Hono routers, mounted under `/api/*` in `server/src/index.ts`
- `server/src/services/` — payroll, reports, audit logic
- `server/src/middleware/auth.ts` — `requireAuth`, `requireRole`
- `server/src/db/schema.ts` — Drizzle schema; `server/migrations/` — committed SQL migrations
- `client/src/pages`, `components`, `api/client.ts`, `context/AuthContext.tsx`
- `docs/` — architecture, database, security, deployment, privacy/accessibility

## Rules
- Roles: `STUDENT` < `SUPERVISOR` < `ADMIN`. `requireRole(...)` always lets `ADMIN` through.
- Enforce authorization server-side; client role checks are UI only. Supervisors are scoped to their own department.
- Validate request bodies with zod (`schema.parse(await c.req.json())`).
- Money is integer cents, time is integer minutes. Use `server/src/lib/money.ts`; convert only at the API boundary. No float dollars.
- Call `writeAuditLog` for every significant mutation.
- Schema changes: edit `schema.ts`, run `db:generate`, commit the new migration. Never edit applied migrations.
- Emails must be normalized `@tntech.edu` (enforced in API and D1 triggers).
- Never commit secrets (`server/.dev.vars`, JWT secrets). Passwords are scrypt hashes only.
- UI must stay accessible: labeled controls, visible focus, `aria-live` for status, reduced-motion support.
- Don't commit `output/`, `tmp/`, `dist/`, or `.wrangler/`.
- Free Workers plan's 10ms CPU limit breaks password hashing in production; local dev is unaffected.
