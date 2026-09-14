# Deployment Plan (all Cloudflare)

Talon runs entirely on Cloudflare: the API is a **Worker**, the database is **D1**, and the React
frontend is served from **Cloudflare Pages**. There is no VM, no container, and no open database
port anywhere in the system.

```mermaid
flowchart LR
    U[Student / Faculty / Admin browser] -->|HTTPS| P[Cloudflare Pages<br/>React frontend]
    U -->|HTTPS /api| W[Cloudflare Worker<br/>Hono API]
    W --> D[(Cloudflare D1<br/>SQLite)]
    W -.->|secrets at runtime| S[Worker Secrets]
    CF[Cloudflare WAF + Rate Limiting + DNS/TLS] --- P
    CF --- W
```

## Sharing the database with your team

A D1 database belongs to a Cloudflare **account**, not to a person or a project. Sharing it means
adding your teammates to that account.

1. You must be **Super Administrator** on the account and have a **verified email address**.
2. Cloudflare dashboard → **Manage Account → Members → Invite**.
3. Enter their email addresses, leave the scope as the whole account, and assign the
   **Cloudflare Workers Admin** role. That covers Workers and D1 without handing over billing or
   DNS. Use *Administrator* only if someone genuinely needs everything.
4. They accept the emailed invitation, run `npx wrangler login`, and immediately see the same
   database from `npx wrangler d1 list`.

Role-based access control is available on every Cloudflare plan, including Free, so this does not
require a paid upgrade.

**Never share the account password, and do not paste an API token into the repo.** For CI or
automated deploys, create a scoped API token with D1 edit permission instead.

### The thing you actually share is the migrations folder

Do not have four people developing against the one remote database. `wrangler dev` gives each
developer a **local** D1 instance, and local and remote data are separated by default. The shared
artifact is `server/migrations/`, committed to git:

```bash
git pull                                  # get the latest migrations
npm run db:migrate:local --workspace=server   # apply them to your own local D1
npm run db:seed:local --workspace=server      # load demo data locally
npm run dev --workspace=server                # work against your local copy
```

The remote database is for the deployed app and shared demos only. Changes made against remote D1
cannot be undone, so a careless `DELETE` there destroys everyone's data; the same mistake locally
costs one reseed.

When someone changes the schema, they edit `server/src/db/schema.ts`, run
`npm run db:generate --workspace=server` to produce a new migration file, and commit it. Everyone
else pulls and applies it. That keeps the schema in version control rather than in one person's
dashboard.

## First-time setup

```bash
# 1. Authenticate
npx wrangler login

# 2. Create the database (only one person does this, then shares the id)
npx wrangler d1 create talon-db

# 3. Put the returned database_id into server/wrangler.toml
#    (the id is NOT a secret - it is safe to commit and teammates need it)

# 4. Create the schema, remotely and locally
npm run db:migrate:remote --workspace=server
npm run db:migrate:local --workspace=server

# 5. Seed demo data
npm run db:seed:generate --workspace=server   # regenerates seed.sql with fresh password hashes
npm run db:seed:local --workspace=server
```

## Secrets

Never put these in `wrangler.toml` and never commit them.

```bash
# Deployed environments
npx wrangler secret put JWT_ACCESS_SECRET --cwd server
npx wrangler secret put JWT_REFRESH_SECRET --cwd server

# Generate values with:
openssl rand -base64 48
```

For local development, copy `server/.dev.vars.example` to `server/.dev.vars` (git-ignored).

## Deploying

```bash
npm run deploy:server    # publishes the Worker
npm run deploy:client    # builds and publishes the frontend to Pages
```

After the first deploy, set the frontend's `VITE_API_BASE_URL` to the Worker URL
(`https://talon-api.<your-subdomain>.workers.dev/api`) and update `CORS_ORIGIN` in
`server/wrangler.toml` to the Pages URL, then redeploy both. A custom domain can be attached to
either from the dashboard.

## Password login requires Workers Paid

Talon stores local email-and-password credentials as requested. Passwords are salted scrypt hashes;
the plaintext is never written to D1. Scrypt deliberately consumes enough CPU and memory to slow
offline cracking if a database copy is stolen.

| Plan | CPU per request | D1 queries per request | Requests/day |
|---|---|---|---|
| Free | **10 ms** | 50 | 100,000 |
| Paid ($5/mo) | 30 s (up to 5 min) | 1,000 | unmetered |

The Free plan allows 10 ms of CPU per request, which is not enough for Talon's password derivation.
Use Workers Paid (minimum $5/month), whose default per-request CPU allowance is 30 seconds. The
stored format records the scrypt parameters (`scrypt$N$r$p$salt$hash`) so hashes remain
self-describing. Local `wrangler dev` also works for development.

Talon checks that every account email ends exactly in `@tntech.edu`. That proves the account was
provisioned with a Tennessee Tech-formatted address; it does not contact Tennessee Tech or prove the
person currently controls that university mailbox. Official account verification would require TN
Tech SSO later.

## Security controls at the edge

Moving off a VM deletes an entire category of hardening work — there is no SSH port to move, no
firewall to configure, no OS to patch, and D1 has no network listener to expose. What replaces it:

- **WAF and Rate Limiting rules** in the Cloudflare dashboard, applied before a request ever reaches
  the Worker. Put a stricter rate limit on `/api/auth/*` than on the rest of the API.
- **TLS** is automatic and cannot be misconfigured to serve plaintext.
- **Cloudflare Access** can restrict the whole app to TN Tech accounts or to campus IP ranges, which
  is the correct layer for the "must be on the TN Tech network" requirement.
- **Secrets** are encrypted at rest by Cloudflare and are never present in the repository.

See [SECURITY.md](SECURITY.md) for the application-level controls.

## Costs

| Item | Free tier | Notes |
|---|---|---|
| Workers | 100k requests/day | 10 ms CPU limit is the blocker described above |
| D1 | 500 MB/database, 5 GB total, 10 databases | Far beyond what this project needs |
| Pages | Unlimited static requests | Frontend hosting is genuinely free |
| Workers Paid | Minimum $5/month | Required for the deployed scrypt password login |
