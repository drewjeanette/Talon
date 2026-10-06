import type { Context } from "hono";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { notificationPreferences, users } from "../db/schema.js";
import { escapeHtml, getEmailSender, type EmailMessage } from "../lib/email.js";
import { NOTIFICATION_TYPES } from "../lib/notification-types.js";
import type { AppEnv } from "../types.js";

/** Public base URL used in emailed links. Never derived from request headers. */
export function appUrl(c: Context<AppEnv>): string {
  return (c.env.APP_URL || new URL(c.req.url).origin).replace(/\/$/, "");
}

/**
 * Sends after the response, so callers never wait on (or leak timing from)
 * the email provider. Failures are logged, never thrown to the user.
 */
export function sendEmailInBackground(c: Context<AppEnv>, message: EmailMessage): void {
  const sending = getEmailSender(c.env)
    .send(message)
    .catch((err) => console.error("Email send failed:", err));
  c.executionCtx.waitUntil(sending);
}

function layout(heading: string, paragraphs: string[], button?: { label: string; url: string }): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`).join("");
  const action = button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(button.url)}" style="background:#4b2e83;color:#fff;padding:12px 20px;border-radius:4px;text-decoration:none;font-weight:600">${escapeHtml(button.label)}</a></p>`
    : "";
  return `<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px;border-top:4px solid #c9a13b">
<h1 style="color:#33205a;font-size:22px;margin:0 0 16px">${escapeHtml(heading)}</h1>${body}${action}
<p style="margin:24px 0 0;color:#514a5b;font-size:13px">Talon · Tennessee Tech Payroll &amp; Web Clock</p></div>`;
}

export function passwordResetEmail(to: string, firstName: string, link: string, minutes: number): EmailMessage {
  const lines = [
    `Hi ${firstName},`,
    `Someone asked to reset the password for your Talon account. The link below works once and expires in ${minutes} minutes.`,
    "If you didn't ask for this, you can ignore this email. Your password won't change.",
  ];
  return {
    to,
    subject: "Reset your Talon password",
    text: `${lines[0]}\n\n${lines[1]}\n\n${link}\n\n${lines[2]}`,
    html: layout("Reset your password", lines, { label: "Reset password", url: link }),
  };
}

export function passwordChangedEmail(to: string, firstName: string): EmailMessage {
  const lines = [
    `Hi ${firstName},`,
    "The password for your Talon account was just changed, and you were signed out on every device.",
    "If this wasn't you, contact the Talon administrator right away.",
  ];
  return {
    to,
    subject: "Your Talon password was changed",
    text: lines.join("\n\n"),
    html: layout("Your password was changed", lines),
  };
}

/**
 * The hook for email notifications. Call it wherever a notifiable event
 * happens; it skips the email if the recipient turned that type off in
 * Settings. Types must be listed in lib/notification-types.ts.
 */
export async function emailNotification(
  c: Context<AppEnv>,
  recipientUserId: number,
  type: string,
  content: { subject: string; heading: string; paragraphs: string[]; button?: { label: string; path: string } }
): Promise<void> {
  if (!NOTIFICATION_TYPES.some((t) => t.type === type)) throw new Error(`Unknown notification type: ${type}`);

  const db = getDb(c.env.DB);
  const [recipient, preference] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, recipientUserId) }),
    db.query.notificationPreferences.findFirst({
      where: and(eq(notificationPreferences.userId, recipientUserId), eq(notificationPreferences.type, type)),
    }),
  ]);
  if (!recipient || !recipient.isActive || preference?.emailEnabled === false) return;

  const button = content.button && { label: content.button.label, url: `${appUrl(c)}${content.button.path}` };
  sendEmailInBackground(c, {
    to: recipient.email,
    subject: content.subject,
    text: [...content.paragraphs, button?.url ?? ""].filter(Boolean).join("\n\n"),
    html: layout(content.heading, content.paragraphs, button),
  });
}
