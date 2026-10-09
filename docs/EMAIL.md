# Email (Resend)

Talon sends email for password resets, password-change alerts, and opt-out notifications.
All sending goes through `getEmailSender()` in `server/src/lib/email.ts`.

| Config | Behavior |
|---|---|
| `RESEND_API_KEY` secret set | Sent through [Resend](https://resend.com) |
| `EMAIL_DEV_LOG=true` (local `.dev.vars`) | Printed to the `wrangler dev` console, including reset links |
| Neither | Dropped with a warning. Links are never logged |

## Turning on real email

1. Create a Resend account and add the domain `talontime.org`.
2. Add the SPF, DKIM and MX records Resend gives you in Cloudflare DNS, then wait for Resend to show "Verified".
3. Create an API key with "Sending access" only.
4. `npx wrangler secret put RESEND_API_KEY` (run in `server/`).
5. Confirm `EMAIL_FROM` and `APP_URL` in `server/wrangler.toml`.
6. Ask TTU IT to allowlist `talontime.org` so messages to `@tntech.edu` aren't quarantined.

Free tier: 3,000 emails/month, 100/day.

## Password reset

- `POST /api/auth/forgot-password` always returns the same message, whether or not the account exists.
- Tokens are 32 random bytes; only the SHA-256 is stored in `password_reset_tokens`.
- A link expires after 30 minutes, works once, and requesting a new link voids older ones.
- Limits: 3 requests per account and 10 per IP per hour. Extra requests are silently ignored.
- A successful reset signs the user out everywhere and sends a "password changed" email.

## Notification emails

- The catalog lives in `server/src/lib/notification-types.ts`. Settings shows each user the types for their role.
- Preferences are stored in `notification_preferences`; a missing row means on.
- To send one, call `emailNotification(c, userId, "TYPE", {...})` from `server/src/services/email.service.ts`
  where the event happens. It checks the user's preference and sends in the background.
- Only send email when someone has to act. No confirmations ("you submitted X", "X was approved").
- Wired today: `PAY_STUB_REJECTED` (to admins) and the payroll deadline reminders below.

## Payroll deadline reminders

An hourly cron trigger (`[triggers]` in `server/wrangler.toml`) runs `runScheduledReminders()` in
`server/src/services/reminder.service.ts`. It works in US Central time and sends each stage once per
pay period (recorded in `reminder_runs`), and only to people with something waiting.

| Pay cycle | Approvals due | Reminder | Deadline morning | Escalation |
|---|---|---|---|---|
| Bi-weekly (period closes Sunday) | Monday 12:00 | Friday 9:00 | Monday 8:00 | Monday 10:00 |
| Monthly | 25th 12:00 (Friday before if a weekend) | 2 business days before, 9:00 | 25th 8:00 | 25th 10:00 |

- **Supervisors** get one summary per stage listing every assigned student with shifts or
  corrections waiting, formatted as a printable checklist (`APPROVAL_REMINDER`, `APPROVAL_ESCALATION`).
  Escalations go to every supervisor assigned to a still-pending student.
- **Admins** get one summary at the escalation, listing everyone still waiting and their supervisors
  (`PAYROLL_SUMMARY`).
- **Students** get one email at the first stage only if a shift was rejected or they are still
  clocked in (`TIME_FIX_REMINDER`).
- Admins can send the supervisor summaries on demand: Time Entry Approvals → Approval Reminders.
- The times are placeholders until the business office sends the official payroll calendar; adjust
  `reminderSchedule()` when it arrives.
