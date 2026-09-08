# Security Design

Talon handles payroll data (SSNs are *not* stored in this scaffold — see [Out of scope](#out-of-scope)),
so the security posture assumes it will eventually sit in front of real wage and personal data for
TN Tech students and faculty. This document covers what's implemented in the code today and what's
a deliberate deployment-time decision for whoever hooks up the real backend/hosting.

## Threat model (summary)

| Actor | Goal | Primary mitigation |
|---|---|---|
| Outside attacker, no credentials | Reach the API/DB directly | Cloudflare in front, no public DB port, GCP firewall default-deny (see [DEPLOYMENT.md](DEPLOYMENT.md)) |
| Credential stuffing / brute force | Log in as someone else | `authRateLimiter` (20 attempts / 15 min / IP), bcrypt cost 12, constant login response shape |
| Authenticated student | View/approve another department's timesheets or pay data | Server-side scoping on every query (see [Authorization](#authorization)), not just hidden UI |
| Authenticated student/supervisor | Escalate to admin | Explicit `requireRole()` allowlist per route; role comes only from a signed JWT, never from client input |
| Malicious/compromised dependency | Supply-chain compromise | `npm audit` run as part of setup; pinned minor versions; see [Dependency hygiene](#dependency-hygiene) |
| Stolen access token (XSS) | Replay it after the session ends | Access token lives in memory only (not localStorage), 15 min expiry; refresh token is httpOnly+SameSite=strict |

## Authentication

- **Passwords**: bcrypt, cost factor 12 (`BCRYPT_SALT_ROUNDS`), never logged, never returned by any
  endpoint. New accounts get a random 16-byte token as a one-time temp password (`mustResetPw: true`)
  instead of an admin-chosen password — see [`users.routes.ts`](../server/src/routes/users.routes.ts).
- **Tokens**: short-lived JWT access token (15 min, `JWT_ACCESS_EXPIRY`) + longer-lived refresh token
  (7 days) stored **hashed** (SHA-256) in `RefreshToken`, never in plaintext, so a DB dump alone
  doesn't hand out valid sessions. Refresh rotates on every use (old token revoked, new one issued) —
  reduces the value of a stolen refresh cookie to a single use.
- **Storage**: access token in a JS variable (memory), never `localStorage`/`sessionStorage`, so it
  can't be read by an XSS payload that persists across reloads. Refresh token is an `httpOnly`,
  `SameSite=strict` cookie scoped to `/api/auth`, so JavaScript — malicious or not — never sees it.
- **Password change** revokes every other outstanding refresh token for that user, so a stolen
  session is killed the moment the real owner notices and changes their password.
- **Real deployment note**: TN Tech likely has SSO (Duo/OneStop/Azure AD). This scaffold's local
  password auth is a placeholder — swap `auth.routes.ts` for an OIDC/SAML flow before handling real
  employees, and keep the role/department mapping logic in `User` regardless of how identity is
  established.

## Authorization

RBAC is enforced **twice**, deliberately redundantly:

1. **Route-level**: `requireRole("SUPERVISOR", "ADMIN")` middleware rejects the wrong role before a
   handler runs at all ([`auth.ts`](../server/src/middleware/auth.ts)).
2. **Query-level**: handlers additionally scope the *data*, not just the *endpoint*. A supervisor's
   `GET /api/reports/payroll` hard-overrides whatever `scope`/`scopeId` they pass with their own
   `departmentId` from the database — see [`reports.routes.ts`](../server/src/routes/reports.routes.ts).
   The same pattern applies to `GET /timeclock/pending` and `GET /users`. This means a bug that only
   forgets step 1 still can't leak another department's data, and vice versa.

`ADMIN` is treated as strictly above `SUPERVISOR`/`STUDENT` (a hierarchy), not a fourth disjoint role —
see the comment in `requireRole()`.

## Network & host hardening

- **Change default ports.** SSH should move off 22, and the MySQL port is *never* exposed publicly at
  all (see below) — `docker-compose.yml` already maps the dev DB to host port `13306` instead of the
  default `3306` as a habit-forming example, and `server/.env.example` defaults the API to `4317`
  instead of `3000`/`8080`. On the GCP VM, change the SSH port in `sshd_config` and update the
  firewall rule to match — default ports are the first thing scanners probe.
- **Default-deny firewall.** GCP firewall rules (or `ufw` on the VM) should allow *only*: HTTPS from
  Cloudflare's IP ranges, SSH from your own IP/VPN on its non-default port, and nothing else inbound.
  Every other port — including the app's own port and the DB port — should not be reachable from the
  public internet at all; the app port is only reached via a reverse proxy on localhost, and the DB
  is only reached from the app server's private IP (or via Cloud SQL Auth Proxy, which needs no open
  DB port whatsoever).
- **No exposed origin.** Prefer a Cloudflare Tunnel (`cloudflared`) over opening any inbound port on
  the VM at all — the tunnel makes an outbound-only connection to Cloudflare, so there is no public
  IP:port for an attacker to find and scan in the first place.
- **TN Tech subnet / campus-only access**: if the requirement is "only reachable from campus," the
  *correct* layer for that is the network edge, not the application:
  - **Preferred**: Cloudflare Access (Zero Trust) policy requiring TN Tech SSO login, or an IP-range
    rule scoped to TN Tech's published CIDR blocks, in front of the tunnel/origin.
  - **Alternative**: GCP VPC firewall rule allowlisting TN Tech's CIDR ranges (get these from TN
    Tech IT/network services — don't guess them).
  - **Defense in depth only**: `networkAllowlist` middleware in [`security.ts`](../server/src/middleware/security.ts)
    can enforce a CIDR allowlist inside the app itself (`ALLOWED_CIDRS` env var). It's disabled by
    default and exists as a second layer, *not* a replacement for the network-level control — an
    app-layer IP check can be bypassed by anything that reaches the app process directly (e.g. a
    misconfigured internal route), whereas a firewall rule can't be.
- **TLS**: terminate TLS at Cloudflare (free tier, "Full (strict)" mode) and use Cloudflare's origin
  certificate between Cloudflare and the VM so traffic is encrypted end-to-end, not just browser-to-edge.

## Application-layer hardening (already in the code)

- **Helmet** sets CSP, HSTS, `X-Content-Type-Options`, frame-ancestors, etc. on every response
  (verified locally — see the response headers in the health-check test).
- **CORS** is an explicit origin allowlist (`CORS_ORIGIN`), not `*`, and `credentials: true` only for
  those listed origins.
- **Rate limiting**: a general API limiter (200 req/15 min/IP) plus a much stricter one on
  `/api/auth/*` (20/15 min/IP) to slow down credential stuffing without a CAPTCHA.
- **Input validation**: every request body/query is parsed through a `zod` schema before touching the
  database — rejects malformed/oversized/wrong-typed input before it reaches business logic.
- **SQL injection**: not applicable in the direct sense — Prisma generates parameterized queries; raw
  SQL (`$queryRaw`) is not used anywhere in this codebase, and if it's ever needed, it must use
  tagged-template parameterization, never string concatenation.
- **Error responses never leak internals.** The centralized error handler
  ([`errorHandler.ts`](../server/src/middleware/errorHandler.ts)) always returns a generic message to
  the client — file paths, stack traces, and raw driver errors (e.g. a Prisma connection failure) are
  logged server-side only, in every environment, not just production. (An earlier draft of this
  scaffold leaked a full stack trace to the browser in dev mode; caught during local verification and
  fixed — see the audit log entry in the repo history.)
- **Audit log**: every login, password change, user creation/deactivation, time-entry decision/edit,
  and clock in/out is written to `AuditLog` with actor, action, entity, and source IP.

## Secrets management

- `.env` files are git-ignored; only `.env.example` (placeholder values) is committed.
- JWT secrets must be long random strings (`openssl rand -base64 48`), validated at startup by a
  `zod` schema — the server refuses to boot with a short/missing secret rather than silently running
  insecurely.
- In production, secrets belong in **GCP Secret Manager** (or Cloud Run/Compute Engine environment
  config backed by it), not in a `.env` file on disk — see [DEPLOYMENT.md](DEPLOYMENT.md).

## Dependency hygiene

Run `npm audit` after any dependency change. As of this scaffold:
- `bcrypt` was pinned to `^6.0.0` (not `5.x`) to avoid a critical transitive `node-tar` advisory in
  its native-build tooling.
- `react-router-dom` was pinned to `^7.18.2` to avoid a moderate open-redirect advisory present in
  `6.x`–`7.17.x`.
- One **moderate, dev-only** advisory remains (`esbuild`/`vite` dev server request handling) — it only
  matters if the Vite dev server itself is exposed to an untrusted network, which it never is in this
  architecture (it's a local build tool; production serves static built assets, not the dev server).

## Accessibility as a security-adjacent requirement

Not a traditional "security" item, but treated with the same seriousness: every interactive control
has a visible label and focus ring (`:focus-visible`, never suppressed), status messages use
`role="status"`/`aria-live="polite"` so screen reader users get the same feedback sighted users do,
and there's a skip-to-content link. See the component code in `client/src/components/` for the pattern
to keep following as the UI grows.

## Out of scope (flag for whoever continues this)

- No SSN or bank account/direct-deposit data model exists yet. If added, it needs field-level
  encryption at rest (not just "the disk is encrypted") and a much tighter access policy than
  anything else in this schema.
- No SSO/OIDC integration yet (see [Authentication](#authentication)).
- No automated dependency scanning (Dependabot/Snyk) wired into CI yet — add it before this goes anywhere near production.
