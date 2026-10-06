# AGENTS.md

Talon: Tennessee Tech payroll + web-clock. Cloudflare Workers (Hono) API + D1 (Drizzle) + React/Vite client served as Worker static assets. npm workspaces: `server/`, `client/`.

## Commands (repo root)
- `npm run dev` — full stack at http://localhost:8787 (local D1)
- `npm run typecheck` — must pass before committing
- `npm run build` — server typecheck + client build
- `npm run test:e2e` — Playwright suite (`e2e/`) on an isolated, freshly seeded server at :8788
- `npm run db:migrate:local` / `db:seed:generate` / `db:seed:local`
- Never run `db:*:remote` or `deploy` unless explicitly asked.
- Pushing to `main` deploys: `.github/workflows/ci-deploy.yml` runs typecheck + Playwright, then remote migrations and deploy to talontime.org. Pull requests run tests only.

## Layout
- `server/src/routes/*.routes.ts` — Hono routers, mounted under `/api/*` in `server/src/index.ts`
- `server/src/services/` — payroll, reports, audit logic
- `server/src/middleware/auth.ts` — `requireAuth`, `requireRole`
- `server/src/db/schema.ts` — Drizzle schema; `server/migrations/` — committed SQL migrations
- `client/src/pages`, `components`, `api/client.ts`, `context/AuthContext.tsx`
- `server/src/lib/email.ts`, `services/email.service.ts` — all outbound email (Resend); see `docs/EMAIL.md`
- `server/src/lib/notification-types.ts` — email notification catalog shown in Settings
- `client/src/pages/SettingsPage.tsx` — add Settings tabs via its `SECTIONS` array
- `docs/` — architecture, database, security, deployment, email, privacy/accessibility

## Rules
- Roles: `STUDENT` < `SUPERVISOR` < `ADMIN`. `requireRole(...)` always lets `ADMIN` through.
- Enforce authorization server-side; client role checks are UI only. Supervisors are scoped to their own department.
- Validate request bodies with zod (`schema.parse(await c.req.json())`).
- Money is integer cents, time is integer minutes. Use `server/src/lib/money.ts`; convert only at the API boundary. No float dollars.
- Call `writeAuditLog` for every significant mutation.
- Schema changes: update `schema.ts` and add the next numbered hand-written SQL file in `server/migrations/` (`NNNN_name.sql`). Never edit applied migrations.
- Emails must be normalized `@tntech.edu` (enforced in API and D1 triggers).
- Never commit secrets (`server/.dev.vars`, JWT secrets). Passwords are scrypt hashes only.
- Send email only through `getEmailSender()`/`emailNotification()`. Never log reset tokens or links outside `EMAIL_DEV_LOG`.
- Auth endpoints that take an email must not reveal whether the account exists.
- Don't commit `output/`, `tmp/`, `dist/`, or `.wrangler/`.
- Free Workers plan's 10ms CPU limit breaks password hashing in production; local dev is unaffected.

## Accessibility (WCAG 2.2 AA required)
- Every UI change must meet WCAG 2.2 Level AA.
- Labeled controls, visible focus that isn't hidden by sticky content, `aria-live`/`role="status"` for async results, reduced-motion support.
- Pointer targets at least 24×24 CSS px (2.5.8). No drag-only interactions (2.5.7).
- Auth forms must allow paste and password managers (correct `autocomplete`), with no cognitive tests (3.3.8).
- Don't make users re-enter info already given in the same flow (3.3.7). Help links stay in a consistent place (3.2.6).
- Contrast: 4.5:1 for text and 3:1 for UI components. Layout works at 320px width and 200% zoom with no horizontal scroll.
- Custom widgets follow WAI-ARIA patterns (keyboard support included), e.g. Settings tabs and switches.

## Testing (Playwright)
- Tests live in `e2e/`. `e2e/start-server.mjs` runs wrangler on :8788 with a fresh D1 in `e2e/.state` on every run.
- Read emailed links with `latestEmailLink()`; use `expectAccessible()` for the axe scan (both in `e2e/helpers.ts`).
- Tests that change a password use the per-project `e2e.reset.*` accounts, never the shared demo logins.
- New features and bug fixes need a Playwright test covering the user flow for every affected role.
- Run `expectAccessible(page)` (axe, WCAG 2.2 AA tags) on every page a test visits.
- Tests must never touch the remote database. Use seed accounts or create test data in the test.
