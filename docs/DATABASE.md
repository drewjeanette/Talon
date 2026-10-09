# Database Design

Talon's schema is defined in [`server/src/db/schema.ts`](../server/src/db/schema.ts) using **Drizzle
ORM**, and targets **Cloudflare D1** (SQLite). The schema file is the single source of truth;
migrations are committed to git and applied in order. Make schema changes through a migration
instead of editing the remote database directly.

## Entity-relationship diagram

```mermaid
erDiagram
    COLLEGES ||--o{ DEPARTMENTS : has
    DEPARTMENTS ||--o{ USERS : employs
    USERS ||--o{ STUDENT_SUPERVISORS : "supervises / is supervised"
    DEPARTMENTS ||--o{ CHARGE_ACCOUNTS : owns
    CHARGE_ACCOUNTS ||--o{ USERS : "charged for job"
    CHARGE_ACCOUNTS ||--o{ TIME_ENTRIES : "charged for shift"
    USERS ||--o{ TIME_ENTRIES : logs
    USERS ||--o{ STUDENT_JOBS : holds
    STUDENT_JOBS ||--o{ TIME_ENTRIES : "worked for"
    USERS ||--o{ TIME_ENTRY_CHANGE_REQUESTS : submits
    USERS ||--o{ PAY_STUBS : receives
    USERS ||--o| USER_PROFILE_PHOTOS : has
    USERS ||--o{ NOTIFICATIONS : receives
    USERS ||--o{ REFRESH_TOKENS : holds
    USERS ||--o{ AUDIT_LOGS : performs
    USERS ||--o{ REPORT_RUNS : requests
    PAY_PERIODS ||--o{ PAY_STUBS : covers
    PAY_PERIODS ||--o{ REMINDER_RUNS : "reminders sent"

    COLLEGES {
        int id PK
        text name
        text code
    }
    DEPARTMENTS {
        int id PK
        text name
        text code
        int college_id FK "nullable until an admin assigns one"
        int is_active "boolean"
    }
    USERS {
        int id PK
        text email
        text password_hash "scrypt$N$r$p$salt$hash"
        text first_name
        text last_name
        text preferred_name "nullable, e.g. Sophie"
        text role "STUDENT | SUPERVISOR | ADMIN"
        text pay_type "BIWEEKLY | MONTHLY"
        int hourly_rate_cents "nullable"
        int annual_salary_cents "nullable"
        int department_id FK "home department"
        int charge_account_id FK "job's charge account (index)"
        int is_active "boolean"
        int must_reset_pw "boolean"
    }
    TIME_ENTRIES {
        int id PK
        int user_id FK
        int clock_in "unix seconds"
        int clock_out "nullable"
        text source "WEB | KIOSK | MANUAL"
        text status "PENDING | APPROVED | REJECTED"
        int charge_account_id FK "copied from the job at clock-in"
        int edited_by_id FK "nullable"
        text rejection_reason "nullable"
    }
    CHARGE_ACCOUNTS {
        int id PK
        text code "Banner index"
        text name
        int department_id FK "owning department, nullable"
        int is_active "boolean"
    }
    STUDENT_JOBS {
        int id PK
        int user_id FK
        text title
        int charge_account_id FK
        int is_active "boolean"
    }
    APP_SETTINGS {
        text key PK
        text value "JSON, e.g. payroll_calendar"
    }
    STUDENT_SUPERVISORS {
        int student_id PK, FK
        int supervisor_id PK, FK
    }
    TIME_ENTRY_CHANGE_REQUESTS {
        int id PK
        int user_id FK
        int time_entry_id FK "nullable for a missed shift"
        int requested_clock_in
        int requested_clock_out
        text reason
        text status "PENDING | APPROVED | REJECTED"
        int reviewer_id FK "nullable"
        text reviewer_reason "nullable"
        int reviewed_at "nullable"
    }
    PAY_PERIODS {
        int id PK
        text type "BIWEEKLY | MONTHLY"
        int start_date
        int end_date
        int pay_date
        text status "OPEN | PROCESSING | CLOSED"
    }
    PAY_STUBS {
        int id PK
        int user_id FK
        int pay_period_id FK
        int regular_minutes
        int overtime_minutes
        int gross_pay_cents
        text status "DRAFT | FINALIZED | PAID"
        int finalized_by_id FK "nullable"
        text review_status "PENDING | APPROVED | REJECTED"
        int reviewed_by_id FK "nullable"
        int reviewed_at "nullable"
        text review_reason "nullable"
    }
    USER_PROFILE_PHOTOS {
        int user_id PK,FK
        text mime_type "JPEG | PNG | WebP"
        blob photo
        real view_zoom
        real view_x
        real view_y
    }
    NOTIFICATIONS {
        int id PK
        int recipient_user_id FK
        int sender_user_id FK "nullable"
        text type
        text title
        text body
        text action "nullable"
        int requires_action "boolean"
        int read_at "nullable"
        int dismissed_at "nullable"
    }
    REPORT_RUNS {
        int id PK
        int requested_by_id FK
        text scope "DEPARTMENT | COLLEGE | ALL"
        int scope_id "nullable"
        int pay_period_id "nullable"
        int row_count
    }
    AUDIT_LOGS {
        int id PK
        int user_id FK "nullable actor"
        text action
        text entity_type
        int entity_id "nullable"
        text metadata "json"
        text ip_address
    }
    REFRESH_TOKENS {
        int id PK
        int user_id FK
        text token_hash "sha-256"
        int expires_at
        int revoked_at "nullable"
    }
```

## Key design decisions

- **Money is INTEGER cents; worked time is INTEGER minutes.** This is the most important difference
  from the earlier MySQL design, which used `DECIMAL(10,2)`. **SQLite has no true DECIMAL type** —
  a "decimal" column has NUMERIC affinity and real values are stored as floating point, which would
  introduce rounding drift into wages. Storing cents keeps every intermediate value exact, with a
  single rounding step at the end ([`lib/money.ts`](../server/src/lib/money.ts)). The API converts at
  the boundary, so clients still see `"195.50"` and `"17.00"`.
- **Timestamps are unix seconds** (Drizzle `integer({ mode: "timestamp" })`), which is SQLite's
  natural representation and sorts and compares correctly.
- **Enums are TEXT with a checked set of values.** SQLite has no native enum; Drizzle's
  `text({ enum: [...] })` gives compile-time type safety over a plain text column.
- **`Role` (permission level) is separate from `payType` (pay cycle).** "student/supervisor/admin" is
  an authorization concept; "biweekly/monthly" is a payroll one. Collapsing them breaks the first
  time a salaried student-services employee or an hourly supervisor appears.
- **Department codes are data, not source code.** `code`, `name`, `college_id` and `is_active` are
  ordinary editable rows managed from the admin UI. `college_id` is nullable because the registrar's
  code list arrives before anyone has assigned each code to a college; `is_active` retires a code
  from the "new user" form without breaking history for employees already assigned to it.
- **`student_supervisors`** lets a student have several supervisors with no primary: any of them (or
  any admin) can approve their time, and it drives the query-level scoping that keeps a supervisor to
  their own students. It replaced `users.supervisor_id` in migration 0008.
- **Charge account is separate from home department.** A job is charged to an index
  (`users.charge_account_id`), copied onto each time entry at clock-in so later job changes never
  rewrite past hours. Reports split each stub across its entries' accounts, to the cent.
- **Pay stubs store their line items** (`hourly_rate_cents`, `regular_pay_cents`,
  `overtime_pay_cents`) at generation, so a later rate change doesn't alter a past stub. Regenerating
  a stub whose numbers changed sends it back for review.
- **Pay stubs are derived from approved time entries**, never hand-entered.
- **Deactivate, never delete** — payroll history must survive an employee leaving.

## Migrations

Migrations live in `server/migrations/` and are committed to git. **This folder, not the remote
database, is how the team shares schema changes.**

```bash
# after editing server/src/db/schema.ts
npm run db:generate         # write a new migration file
npm run db:migrate:local    # apply to your own local D1
npm run db:migrate:remote   # apply to the shared database
```

Seed data is generated rather than hand-written, because the demo accounts need real salted scrypt hashes:

```bash
npm run db:seed:generate   # writes server/seed/seed.sql
npm run db:seed:local
```

The seed creates 2 colleges, all 104 registrar department codes, 3 charge accounts, an admin, two
supervisors (Computer Science and Mathematics), nine students, shifts, correction requests, and four
pay periods (the previous bi-weekly and monthly periods already generated). Dates are relative to
when the seed is generated.

## Query budget

D1 counts every query as a subrequest, and the Workers **Free** plan allows only **50 per
invocation** (1,000 on Paid). Code that queries inside a loop over employees will fail once the
payroll grows past ~48 people.

`generatePayStubsForPeriod()` is therefore written to use a **fixed** number of queries regardless of
headcount: one for the employees, one for all their approved time entries (`inArray`), and one
`db.batch()` for all the writes. The batch is also atomic, so a partially generated payroll run
cannot be left behind.
