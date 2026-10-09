import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Demo accounts from server/seed (local test database only).
export const SEED_PASSWORD = "password123";
export const ACCOUNTS = {
  STUDENT: "student@tntech.edu",
  SUPERVISOR: "supervisor@tntech.edu",
  ADMIN: "admin@tntech.edu",
} as const;
export type Role = keyof typeof ACCOUNTS;

/** More seed accounts (same password): a second supervisor and named students. */
export const PEOPLE = {
  SECOND_SUPERVISOR: "supervisor2@tntech.edu", // Marcus Reyes, Mathematics
  SOPHIE: "sophia.wells@tntech.edu", // Sophia (Sophie) Wells, CSC, charged to grant G21047
  LIZ: "elizabeth.park@tntech.edu", // Elizabeth (Liz) Park, supervised by both supervisors
  KATHERINE: "katherine.diaz@tntech.edu", // has a rejected shift to fix
} as const;

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

/** Signs in and waits for the dashboard. */
export async function signInToDashboard(page: Page, email: string) {
  await signIn(page, email);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Good");
}

/** Signs out (by dropping the session cookie) and signs in as someone else. */
export async function switchUser(page: Page, email: string) {
  await page.context().clearCookies();
  await signInToDashboard(page, email);
}

/** Opens an admin tool from the overview tiles. */
export async function openAdminTool(page: Page, title: string) {
  await page.getByRole("button", { name: new RegExp(`^${title}`) }).click();
  await expect(page.getByRole("heading", { level: 2, name: title, exact: true }).first()).toBeVisible();
}

/** The suggestions under a person search. */
export function suggestions(page: Page, label: string) {
  return page.getByRole("listbox", { name: `${label} suggestions` }).getByRole("option");
}

/** Types into a person search and picks the suggestion starting with `name`. */
export async function pickPerson(page: Page, label: string, query: string, name: string, scope: Page | Locator = page) {
  await scope.getByRole("combobox", { name: label }).fill(query);
  await suggestions(page, label).filter({ hasText: name }).first().click();
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
