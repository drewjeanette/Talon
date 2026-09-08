# Project Timeline

A suggested semester-scale schedule for the Talon capstone, sized around a ~15-week term. Adjust
dates to your actual syllabus; the sequencing/dependencies are the part worth keeping.

```mermaid
gantt
    title Talon Capstone Project Timeline
    dateFormat  YYYY-MM-DD
    axisFormat  %b %d
    todayMarker on

    section Planning & Design
    Requirements gathering            :done,    des1, 2026-08-24, 7d
    Architecture & DB design          :active,  des2, 2026-08-31, 10d

    section Core Backend
    Auth & RBAC                       :         be1, after des2, 10d
    Timeclock & payroll engine        :         be2, after be1, 14d
    Reports API                       :         be3, after be2, 7d

    section Frontend
    Login & role-based dashboards     :         fe1, after be1, 14d
    Admin & supervisor tooling        :         fe2, after be3, 10d

    section Security & Infrastructure
    Security review & pen-test pass   :         sec1, after fe2, 10d
    GCP + Cloudflare deployment        :crit,    infra1, after sec1, 10d

    section QA & Delivery
    Accessibility audit               :         qa1, after fe2, 7d
    Testing & bug fixing              :         qa2, after infra1, 10d
    Documentation & presentation prep :         doc1, after qa2, 7d
```

## Milestones tied to this repo

| Phase | Status | Artifact |
|---|---|---|
| Architecture & DB design | Done | [DATABASE.md](DATABASE.md), `server/prisma/schema.prisma` |
| Auth & RBAC | Done (local scaffold) | `server/src/routes/auth.routes.ts`, `middleware/auth.ts` |
| Timeclock & payroll engine | Done (local scaffold) | `server/src/services/payroll.service.ts` |
| Reports API | Done (local scaffold) | `server/src/routes/reports.routes.ts` |
| Frontend dashboards | Done (local scaffold) | `client/src/pages`, `client/src/components` |
| Security review | Ongoing | [SECURITY.md](SECURITY.md) |
| GCP + Cloudflare deployment | Not started | [DEPLOYMENT.md](DEPLOYMENT.md) |
| Accessibility audit | Baseline in place, needs a real screen-reader pass | [SECURITY.md#accessibility](SECURITY.md#accessibility-as-a-security-adjacent-requirement) |
| Testing & QA | Not started | add `server`/`client` test suites |
| Documentation & presentation | Ongoing | this `docs/` folder |
