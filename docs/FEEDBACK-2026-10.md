# Business Office Review (October 2026)

Business office / payroll staff reviewed Talon as Admin, Supervisor, and Student.
This file tracks what came out of that review and where each item stands.

## Keep as-is

- Design, colors, single-page layout with "Back to Overview".
- To-do list where items disappear only once completed, with the completion animation.
- Approve/reject time entries with a required reason on reject.
- Student clock in/out with no break punches.
- Correction request flow (past shift or missing shift, required reason, corrected time).
- Admin-only user creation; no student self-registration.
- Roles stay Admin / Supervisor / Student (no primary/secondary line manager roles).
- Bi-weekly and monthly pay periods.

## Action items

| # | Item | Status |
|---|------|--------|
| 1 | Multi-person payroll comparison (filter by student, sortable table) | Done |
| 2 | Charge account (index) on jobs/entries; report filter and group-by | Done |
| 3 | Hours on payroll reports (bi-weekly and monthly) | Done |
| 4 | Regular vs overtime hours and pay columns | Done |
| 5 | Admins can edit pay rates; editing lives in payroll/approvals | Done |
| 6 | Any assigned supervisor or any admin can approve corrections | Done |
| 7 | Show who a request waits on and how long it has been pending | Done |
| 8 | One notification/to-do area; items stay until the action is done | Done |
| 9 | "My Paystubs" is a plain list; student paystub review with batch approve and flag | Done |
| 10 | Paystub PDF download | Done |
| 11 | Consistent type-ahead search (partial, first/last, nicknames, typos); consistent date/time pickers | Done |
| 12 | Demo data: more students, 2+ departments, 2+ supervisors | Done |
| 13 | Action-only email reminders around payroll deadlines | Built; times are placeholders until the business office sends the payroll calendar and time-entry guide |

## Where each item lives

1. **Comparison**: Generate Payroll and Pay Periods → Payroll Report (supervisors see it on their
   dashboard). Pick people with the People search, tick two or more rows, and choose "Compare
   selected". Line items that differ are highlighted. Everything opens in the same window.
2. **Charge accounts**: Departments & Colleges → Charge Accounts; assign one per job in User
   Management. The report filters and groups by charge account as well as home department.
3. **Hours**: every report line and stub shows regular, overtime, and total hours, for bi-weekly and
   monthly periods.
4. **Regular vs overtime**: regular hours, regular pay, overtime hours, overtime pay, total pay.
5. **Pay rates**: Time Entry Approvals → Student Hourly Pay Rates, for admins and assigned
   supervisors. User Management only sets the starting rate.
6. **Approvals**: a student can have several supervisors; any of them or any admin approves.
7. **Status**: students see who a request waits on and how long it has been pending.
8. **One to-do list** per role, computed from the work itself, so items leave only when the work is
   done (with the completion animation). The separate bell panel is gone.
9. **Pay stubs**: "My Pay Stubs" is a plain list. "Student Pay Stub Review" lists only student stubs,
   with individual or batch approval and a flag/answer question thread.
10. **PDF**: every pay stub list has a Download PDF button.
11. **Search**: one type-ahead search everywhere (partial, first/last/preferred names, common
    nicknames such as Bob/Rob/Bert for Robert, typos). One date/time picker: values are saved only
    with the form's button.
12. **Demo data**: two departments, two supervisors, nine students (see README).
13. **Reminders**: see [EMAIL.md](EMAIL.md#payroll-deadline-reminders).

## Not done / follow-ups

- A student with two concurrent jobs still has one default charge account; supervisors can't yet
  move a single shift to another account from the UI.
- Reminder times need confirming against the official payroll calendar.
