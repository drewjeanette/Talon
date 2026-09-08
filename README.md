# Talon

A redesign of Tennessee Tech's payroll & web-clock system (the brief: replace the Oracle-based
system with something modern, secure, and cloud-hosted). This repo is a **locally-runnable
full-stack scaffold** — auth/RBAC, web clock, payroll calculation, and auto-generated department
reports all work today against a local MySQL instance. Cloud hosting (GCP + Cloudflare) is designed
but not yet connected — see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — stack, folder layout, request flow, role/feature matrix
- [docs/DATABASE.md](docs/DATABASE.md) — ER diagram and schema design rationale
- [docs/SECURITY.md](docs/SECURITY.md) — threat model, auth design, network hardening, subnet-restriction options
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — GCP free-tier + Cloudflare hosting plan
- [docs/GANTT.md](docs/GANTT.md) — suggested capstone project timeline

## Features implemented

- JWT auth with rotating refresh tokens; role hierarchy student < supervisor < admin
- Web clock (clock in/out) with a supervisor/admin approval queue and correction workflow
- Payroll engine: biweekly hourly pay (with per-week overtime) for students, monthly salary for
  faculty/staff
- Auto-generated CSV payroll reports scoped by department or college (supervisors are server-side
  pinned to their own department)
- Admin user management and pay-period lifecycle (create → generate stubs → finalize)
- Admin department/college management — codes seeded from a registrar list but fully editable
  (add, rename, reassign to a college, deactivate) from the dashboard, backed by real DB rows
  rather than a hardcoded list
- Security hardening: helmet CSP/HSTS, rate limiting, input validation, audit logging, non-default
  ports, optional network CIDR allowlist — details in [docs/SECURITY.md](docs/SECURITY.md)
- Accessible UI: labeled form controls, visible focus states, `aria-live` status regions, skip link

## Quick start — just want to see the UI? (no database needed)

The frontend has a **mock mode** that fakes every API call in-memory, so you can click through all
three dashboards (student/supervisor/admin) with zero setup — no Docker, no MySQL, no server process.

```bash
npm install --workspace=client
cp client/.env.example client/.env
# open client/.env and set VITE_MOCK_MODE=true
npm run dev:client   # http://localhost:5173
```

Log in with any of the seeded demo accounts below — mock mode accepts the same credentials as the
real seed data. State (clock in/out, approvals, new users/pay periods you create) lives only in
memory and resets on page reload. See [`client/src/api/mock.ts`](client/src/api/mock.ts) — it's an
isolated fake API layer, not part of the real app logic, safe to delete once the real backend is
connected.

## Quick start — full stack (real database)

Prerequisites: Node.js 20+, Docker (for local MySQL) — or point `DATABASE_URL` at any MySQL 8 instance.

```bash
npm install

# Start local MySQL (or skip this and use your own MySQL instance)
npm run db:up

# Configure environment
cp server/.env.example server/.env
cp client/.env.example client/.env
# edit server/.env: set real JWT_ACCESS_SECRET / JWT_REFRESH_SECRET (openssl rand -base64 48)
# edit client/.env: make sure VITE_MOCK_MODE=false so it talks to the real server

# Set up the database
npm run prisma:migrate
npm run prisma:seed

# Run both apps
npm run dev:server   # http://localhost:4317
npm run dev:client   # http://localhost:5173
```

Seeded accounts (see `server/prisma/seed.ts`) — all use the passwords below and are forced to keep
them only because `mustResetPw` is off for seed data; **change these before using real data**:

| Role | Email | Password |
|---|---|---|
| Admin | admin@tntech.edu | `ChangeMe!Admin1` |
| Supervisor | supervisor@tntech.edu | `ChangeMe!Super1` |
| Student | student@tntech.edu | `ChangeMe!Student1` |

## Project structure

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#repository-layout).
