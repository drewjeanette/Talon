import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Demo accounts from server/seed (local test database only).
export const SEED_PASSWORD = "password123";
export const ACCOUNTS = {
  STUDENT: "student@tntech.edu",
  SUPERVISOR: "supervisor@tntech.edu",
  ADMIN: "admin@tntech.edu",
} as const;
export type Role = keyof typeof ACCOUNTS;

const WCAG_22_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Fails the test on any WCAG 2.2 A/AA violation axe can detect on the current page. */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`);
  expect(summary, "WCAG 2.2 AA violations").toEqual([]);
}

export async function signIn(page: Page, email: string, password = SEED_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("TN Tech email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** The newest emailed link for `to` that contains `path`, read from the test server log. */
export async function latestEmailLink(to: string, path: string): Promise<string> {
  const log = join(__dirname, ".server.log");
  let link: string | undefined;
  await expect
    .poll(() => {
      const blocks = readFileSync(log, "utf8")
        .split("[email] To: ")
        .filter((b) => b.startsWith(to) && b.includes(path));
      link = blocks.at(-1)?.match(new RegExp(`https?://\\S+${path}\\S*`))?.[0];
      return link;
    }, { message: `email to ${to} containing ${path}` })
    .toBeTruthy();
  return link!;
}
