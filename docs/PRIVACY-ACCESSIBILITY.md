# Privacy and Accessibility Release Checklist

Talon includes technical safeguards, a public privacy notice, and an accessibility statement. Those
features support compliance, but Tennessee Tech must complete the institutional steps below before
the prototype is used with production payroll or personnel records.

## Before production data is added

- Name the Tennessee Tech office that owns Talon and the people responsible for privacy, security,
  accessibility, records, and incident response.
- Have the appropriate Tennessee Tech privacy, legal, records, information-security, HR/payroll, and
  FERPA officials approve the data inventory, purposes, access model, and public privacy notice.
- Complete the Cloudflare vendor/security review and required contract or data-processing terms.
  Confirm approved data locations, subprocessors, breach terms, deletion terms, and account ownership.
- Assign a Tennessee Tech records-retention category and deletion procedure to accounts, time entries,
  corrections, approvals, pay records, reports, photos, notifications, session records, and audit logs.
- Document whether each student record is an education record, an employment record, or both, and
  apply Tennessee Tech's FERPA policy and legitimate-interest rules where FERPA applies.
- Keep Social Security numbers, bank details, tax forms, medical/disability information, government
  identifiers, and other unnecessary sensitive data out of Talon.

## Ongoing controls

- Review administrator and supervisor access regularly and remove access promptly when roles change.
- Review audit logs and Cloudflare security events, test account recovery, rotate secrets, apply
  dependency updates, and test backups and restoration on a documented schedule.
- Maintain an incident-response process that covers containment, evidence, Tennessee breach-notice
  analysis, FERPA obligations, Cloudflare coordination, and communication with affected people.
- Provide a documented way for people to request access or correction, ask a privacy question, report
  an accessibility barrier, and request an accommodation.
- Review the privacy notice whenever data, purpose, sharing, hosting, retention, or user rights change.

## Accessibility checks for every release

- Meet WCAG 2.1 Level AA, the standard identified for state and local government web content under
  the Department of Justice's Title II rule.
- Run Lighthouse on the sign-in page and every role dashboard. Resolve accessibility, best-practice,
  and console-error failures before release.
- Test all tasks using only a keyboard at 200% zoom and with reduced motion enabled.
- Test the sign-in flow and each role's main tasks with at least one current screen reader.
- Check contrast, focus order, error identification, accessible names, tables, dialogs, status messages,
  reflow, touch targets, and uploaded or generated documents.
- Record the date, browser, assistive technology, tester, findings, and fixes. Automated tools do not
  replace manual testing or testing by people with disabilities.

## Current public pages

- `/privacy` describes Talon's current data practices and production-review requirements.
- `/accessibility` explains the accessibility target, available features, and how to get help.
