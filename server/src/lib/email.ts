import type { Bindings } from "../types.js";

// Outbound email. Every message goes through getEmailSender(), so the provider
// is chosen in one place:
//   * RESEND_API_KEY set     -> sent through Resend (https://resend.com)
//   * EMAIL_DEV_LOG = "true" -> printed to the `wrangler dev` console (local only)
//   * neither                -> dropped with a warning; no links are logged

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

const resendSender = (apiKey: string, from: string): EmailSender => ({
  async send(message) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
    });
    if (!res.ok) throw new Error(`Resend rejected email (${res.status}): ${await res.text()}`);
  },
});

const devLogSender: EmailSender = {
  async send(message) {
    console.log(`[email] To: ${message.to}\n[email] Subject: ${message.subject}\n${message.text}`);
  },
};

const disabledSender: EmailSender = {
  async send(message) {
    console.warn(`[email] Email is not configured; dropped "${message.subject}".`);
  },
};

export function getEmailSender(env: Bindings): EmailSender {
  if (env.RESEND_API_KEY) return resendSender(env.RESEND_API_KEY, env.EMAIL_FROM || "Talon <no-reply@talontime.org>");
  if (env.EMAIL_DEV_LOG === "true") return devLogSender;
  return disabledSender;
}

/** Escapes text for interpolation into an email's HTML body. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
