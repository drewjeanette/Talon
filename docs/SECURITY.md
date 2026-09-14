# Security Design

Talon handles payroll data for TN Tech students and faculty. This document covers what is
implemented in the code today and what is a deliberate deployment decision.

The system runs entirely on Cloudflare (Workers + static assets + D1), which changes the threat model
compared to a self-hosted server: there is no operating system to patch, no SSH port, and no
database listening on a network socket.

## Threat model

| Actor | Goal | Primary mitigation |
|---|---|---|
| Outside attacker, no credentials | Reach the API or database directly | D1 has no public endpoint at all; it is reachable only through the Worker binding |
| Credential stuffing / brute force | Log in as someone else | Memory-hard scrypt hashes, Cloudflare Rate Limiting on `/api/auth/*`, identical failure responses |
| Authenticated student | Read or approve another department's data | Server-side query scoping, verified by test (see below) |
| Authenticated supervisor | Escalate to admin, or read another department | Role checked from a signed JWT; report scope overwritten server-side |
| Stolen access token (XSS) | Replay the session | Token held in memory only, 15 minute expiry; refresh token is httpOnly + SameSite=Strict |
| Stolen database dump | Recover passwords or sessions | Passwords are salted scrypt hashes; refresh tokens stored as SHA-256 hashes, not raw |
| Malicious dependency | Supply-chain compromise | `npm audit` in setup; small dependency surface (Hono, Drizzle, jose, Zod) |

## Authentication

- **Passwords**: scrypt through Cloudflare Workers' native `node:crypto` implementation, using
  `N=32768`, `r=8`, and `p=3`, with a fresh 16-byte random salt for every password and a constant-time
  comparison on verify. D1 stores only the self-describing value (`scrypt$N$r$p$salt$hash`).
- **Email restriction**: login and account provisioning normalize addresses to lowercase and accept
  only addresses ending exactly in `@tntech.edu`. D1 insert and update triggers enforce the same rule
  if data is written outside the API.
- **CPU cost is a real constraint.** Scrypt is deliberately expensive and requires the Workers Paid
  plan. See [DEPLOYMENT.md](DEPLOYMENT.md#password-login-requires-workers-paid).
- **Tokens**: 15-minute JWT access token plus a 7-day refresh token. Refresh tokens are stored
  **hashed** (SHA-256) in D1 and **rotate on every use** — the presented token is revoked and a new
  one issued, so a stolen refresh cookie is worth a single use at most.
- **Storage**: the access token lives in a JavaScript variable, never `localStorage`, so an XSS
  payload cannot read a token that survives a reload. The refresh token is an `httpOnly`,
  `SameSite=Strict` cookie scoped to `/api/auth`, so page JavaScript never sees it at all.
- **Password change** revokes every other outstanding refresh token for that user in the same atomic
  batch as the password update.
- **New accounts** receive a cryptographically random one-time password, returned once to the admin
  for out-of-band delivery, with `mustResetPw` set.

## Authorization

RBAC is enforced **twice**, deliberately:

1. **Route level** — `requireRole("SUPERVISOR")` rejects the wrong role before a handler runs
   ([`middleware/auth.ts`](../server/src/middleware/auth.ts)).
2. **Query level** — handlers scope the *data*, not just the endpoint. A supervisor's report request
   has its `scope`/`scopeId` parameters **overwritten** with their own department id read from the
   database ([`routes/reports.routes.ts`](../server/src/routes/reports.routes.ts)). The same applies
   to `/timeclock/pending` and `/users`, which filter on `supervisorId`.

A bug in one layer therefore cannot leak another unit's payroll data on its own.

`ADMIN` sits above `SUPERVISOR` and `STUDENT` in a hierarchy rather than being a disjoint role.

### Verified, not just claimed

These were exercised against a running Worker and D1 during development:

| Test | Result |
|---|---|
| Student requests `/reports/payroll` | `403 Insufficient permissions.` |
| Student requests `/users` and `POST /users` | `403` on both |
| Supervisor requests `scope=ALL` | Silently narrowed to their own department; another department's employee absent from output |
| Supervisor forges `scope=DEPARTMENT&scopeId=<other dept>` | Still pinned to their own department |
| Login with wrong password vs. unknown email | Byte-identical `Invalid email or password.` |
| Request with no token | `401` |

## Application-layer controls

- **Security headers** on every response via Hono's `secureHeaders()` — CSP, HSTS,
  `X-Content-Type-Options`, frame-ancestors, referrer policy.
- **CORS** is an explicit origin allowlist, never `*`, with credentials enabled only for listed
  origins.
- **Input validation**: every request body and query string is parsed through a Zod schema before it
  reaches business logic.
- **SQL injection**: Drizzle generates parameterized statements; no string-concatenated SQL exists in
  the codebase. The only raw SQL is the generated migration files and the seed script.
- **Error responses never leak internals.** The central handler returns generic messages in every
  environment; full detail goes only to the Worker log (`wrangler tail`). Unique-constraint
  violations are mapped to a clean `409` rather than surfacing a driver error.
- **Audit log**: logins, password changes, user create/deactivate, department changes, clock in/out,
  approvals, corrections, and report runs are recorded with actor, entity, and the true client IP
  from `CF-Connecting-IP` (which, unlike a self-reported `X-Forwarded-For`, cannot be spoofed by the
  caller).

## Edge controls (replacing VM hardening)

The original design targeted a virtual machine and spent considerable effort on changing default
ports, closing unused ports, and firewall rules. On Cloudflare that work is obsolete: there is no
host to harden and D1 exposes no network port. Equivalent protection now comes from:

- **Cloudflare WAF** — managed rulesets in front of the Worker.
- **Cloudflare Rate Limiting** — applied at the edge before the Worker executes, so abusive traffic
  costs nothing. Configure a stricter rule for `/api/auth/*`.
- **Cloudflare Access (Zero Trust)** can optionally add a second perimeter around the application or
  restrict it to campus IP ranges. Talon's own email-and-password login remains authoritative.
- **Automatic TLS** — cannot be accidentally misconfigured to serve plaintext.

## Secrets management

- `.dev.vars` and `.env` are git-ignored; only `.example` files with placeholders are committed.
- Deployed secrets live in Worker Secrets (`wrangler secret put`), encrypted at rest, never in
  `wrangler.toml` and never in the repository.
- The D1 `database_id` in `wrangler.toml` is **not** a secret — it is an identifier, and teammates
  need it. Access is controlled by Cloudflare account membership, not by hiding the id.
- JWT secrets must be long random values (`openssl rand -base64 48`).

## Data integrity

- **Money is stored as integer cents and worked time as integer minutes.** SQLite has no true
  `DECIMAL` type, so storing dollars as a floating-point number would introduce rounding drift into
  wages. All arithmetic stays in integer space with a single rounding step
  ([`lib/money.ts`](../server/src/lib/money.ts)). Verified: a $65,000 salary yields exactly
  $5,416.67/month, and 17.00 hours at $11.50 yields exactly $195.50.
- **Pay stubs are derived, never hand-entered** — there is no endpoint that accepts a gross pay
  figure, which removes a class of payroll fraud.
- **Time entries are not silently editable.** A supervisor correction stamps `editedById` and resets
  the entry to `PENDING`, so it re-enters the approval queue instead of taking effect quietly.
- **Records are deactivated, not deleted**, preserving payroll history.

## Known gaps

- Talon verifies that an account uses the `@tntech.edu` domain; it does not verify employment or
  enrollment status with Tennessee Tech's identity provider.
- No automated test suite. The verification above was performed manually.
- No SSN or bank/direct-deposit fields exist. If added, they need field-level encryption and a
  tighter access policy than anything currently in the schema.
- No automated dependency scanning (Dependabot/Snyk) in CI.
- Rate limiting currently depends on Cloudflare dashboard rules being configured; it is not
  expressed in code.
