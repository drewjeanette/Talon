import { test, expect } from "@playwright/test";
import { ACCOUNTS, PEOPLE, SEED_PASSWORD, expectAccessible, openAdminTool, pickPerson, signInToDashboard, suggestions } from "./helpers";

test.describe("person search behaves the same everywhere", () => {
  test("admin compares two students on the same page and keeps each selection", async ({ page }, testInfo) => {
    await signInToDashboard(page, ACCOUNTS.ADMIN);
    await openAdminTool(page, "User Management");
    await page.getByRole("button", { name: "Compare students", exact: true }).click();
    const first = page.getByRole("region", { name: "Student 1 comparison", exact: true });
    const second = page.getByRole("region", { name: "Student 2 comparison", exact: true });
    const historyResponse = page.waitForResponse((response) => /\/timeclock\/students\/\d+\/entries$/.test(response.url()));
    await pickPerson(page, "Student 1", "sophie", "Sophia (Sophie) Wells");
    const history = await (await historyResponse).json() as { status: string; minutes: number | null }[];
    expect(history.length).toBeGreaterThan(0);
    await expect(first.getByRole("region", { name: "Shift history for Sophia (Sophie) Wells", exact: true }).getByRole("listitem")).toHaveCount(history.length);
    const approvedHours = (history.filter((entry) => entry.status === "APPROVED").reduce((total, entry) => total + (entry.minutes ?? 0), 0) / 60).toFixed(2);
    await expect(first.locator("dl > div").filter({ has: page.getByText("Approved hours", { exact: true }) })).toContainText(approvedHours);
    await page.getByRole("combobox", { name: "Student 2", exact: true }).fill("sophie");
    await expect(suggestions(page, "Student 2").filter({ hasText: "Sophia (Sophie) Wells" })).toHaveCount(0);
    await pickPerson(page, "Student 2", "liz", "Elizabeth (Liz) Park");
    await expect(first.getByRole("heading", { name: "Sophia (Sophie) Wells", exact: true })).toBeVisible();
    await expect(second.getByRole("heading", { name: "Elizabeth (Liz) Park", exact: true })).toBeVisible();
    await expect(second).toContainText("Math Tutor");
    await expect(second.getByRole("region", { name: "Shift history for Elizabeth (Liz) Park", exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "2 of 2 students selected." })).toBeVisible();
    await expectAccessible(page);
    await page.screenshot({ path: testInfo.outputPath("student-comparison.png"), fullPage: true });

    await page.getByRole("button", { name: "Back to user list", exact: true }).click();
    await expect(page.getByRole("region", { name: "All users", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Compare students", exact: true }).click();
    await expect(first.getByRole("heading", { name: "Sophia (Sophie) Wells", exact: true })).toBeVisible();
    await page.route("**/api/timeclock/students/*/entries", (route) => route.fulfill({ status: 503, json: { error: "Temporarily unavailable" } }), { times: 1 });
    await page.getByRole("combobox", { name: "Student 2", exact: true }).fill("bob");
    await page.getByRole("combobox", { name: "Student 2", exact: true }).press("ArrowDown");
    await page.getByRole("combobox", { name: "Student 2", exact: true }).press("Enter");
    await expect(second.getByRole("heading", { name: "Robert Hale", exact: true })).toBeVisible();
    await expect(first.getByRole("heading", { name: "Sophia (Sophie) Wells", exact: true })).toBeVisible();
    await expect(second.getByRole("status").filter({ hasText: "Could not load time entries." })).toBeVisible();
    await expect(second.getByRole("region", { name: "Shift history for Elizabeth (Liz) Park", exact: true })).toHaveCount(0);
    const retriedHistory = page.waitForResponse((response) => /\/timeclock\/students\/\d+\/entries$/.test(response.url()) && response.status() === 200);
    await second.getByRole("button", { name: "Retry time entries" }).click();
    await retriedHistory;
    await expect(second.getByRole("region", { name: "Shift history for Robert Hale", exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await expectAccessible(page);
  });

  test("admin finds people by preferred name, nickname, partial name, and typo", async ({ page }) => {
    await signInToDashboard(page, ACCOUNTS.ADMIN);
    await openAdminTool(page, "User Management");
    const search = page.getByRole("combobox", { name: "Find people" });

    const cases: [string, string][] = [
      ["Sophie Wells", "Sophia (Sophie) Wells"],
      ["bob", "Robert Hale"],
      ["dick", "Richard Moss"],
      ["Wells, Sophie", "Sophia (Sophie) Wells"],
      ["Turnr", "William Turner"],
      ["liz", "Elizabeth (Liz) Park"],
    ];
    for (const [query, name] of cases) {
      await search.fill(query);
      await expect(search).toHaveAttribute("aria-expanded", "true");
      await expect(suggestions(page, "Find people").first(), `"${query}" should suggest ${name}`).toContainText(name);
    }

    // Keyboard: arrow to the suggestion and press Enter to pick it.
    await search.fill("chris");
    await expect(suggestions(page, "Find people").first()).toContainText("Chris Student");
    await search.press("ArrowDown");
    await search.press("ArrowUp");
    await search.press("Enter");
    await expect(page.getByRole("list", { name: "Selected for Find people" })).toContainText("Chris Student");
    const table = page.getByRole("region", { name: "All users" });
    await expect(table.getByRole("rowheader")).toHaveText(["Chris Student"]);
    await expectAccessible(page);

    await page.getByRole("button", { name: "Remove Chris Student" }).click();
    await expect(table.getByRole("rowheader").filter({ hasText: "Robert Hale" })).toBeVisible();
  });
});

for (const role of ["STUDENT", "SUPERVISOR"] as const) {
  test(`${role.toLowerCase()} cannot access the admin comparison time history`, async ({ request }) => {
    const login = await request.post("/api/auth/login", { data: { email: ACCOUNTS[role], password: SEED_PASSWORD } });
    expect(login.ok()).toBeTruthy();
    const { accessToken } = await login.json();
    const response = await request.get("/api/timeclock/students/1/entries", { headers: { Authorization: `Bearer ${accessToken}` } });
    expect(response.status()).toBe(403);
  });
}

test.describe("supervisors only see their own students; admins see everyone", () => {
  test("first supervisor sees Computer Science students, including the shared one", async ({ page }) => {
    await signInToDashboard(page, ACCOUNTS.SUPERVISOR);
    const rate = (name: string) => page.getByRole("spinbutton", { name: new RegExp(`^${name.replace(/[()]/g, "\\$&")}`) });
    await expect(rate("Chris Student")).toBeVisible();
    await expect(rate("Elizabeth (Liz) Park")).toBeVisible();
    await expect(rate("Robert Hale")).toHaveCount(0);
    const report = page.locator(".payroll-report");
    await expect(report.getByRole("rowheader", { name: "Chris Student" })).toBeVisible();
    await expect(report.getByRole("rowheader", { name: "Robert Hale" })).toHaveCount(0);
    await expectAccessible(page);
  });

  test("second supervisor sees Mathematics students and the shared student", async ({ page }) => {
    await signInToDashboard(page, PEOPLE.SECOND_SUPERVISOR);
    const rate = (name: string) => page.getByRole("spinbutton", { name: new RegExp(`^${name.replace(/[()]/g, "\\$&")}`) });
    await expect(rate("Robert Hale")).toBeVisible();
    await expect(rate("Elizabeth (Liz) Park")).toBeVisible();
    await expect(rate("Chris Student")).toHaveCount(0);
    await expectAccessible(page);
  });

  test("admin sees students from every department", async ({ page }) => {
    await signInToDashboard(page, ACCOUNTS.ADMIN);
    await openAdminTool(page, "Time Entry Approvals");
    await expect(page.getByRole("spinbutton", { name: /^Chris Student/ })).toBeVisible();
    await expect(page.getByRole("spinbutton", { name: /^Robert Hale/ })).toBeVisible();
    await expectAccessible(page);
  });
});

test("admin adds a charge account and a student with a preferred name and two supervisors", async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  const code = `E2E-${project.toUpperCase()}`;
  await signInToDashboard(page, ACCOUNTS.ADMIN);

  await openAdminTool(page, "Departments & Colleges");
  await page.getByLabel("Index code").fill(code);
  await page.getByLabel("Account name").fill(`Test grant (${project})`);
  await page.getByRole("button", { name: "Add charge account" }).click();
  await expect(page.locator(".charge-accounts").getByRole("status")).toHaveText(`Charge account ${code} added.`);
  await expect(page.getByRole("rowheader", { name: code })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("button", { name: "Back to Overview" }).click();
  await openAdminTool(page, "User Management");
  const form = page.locator(".user-management__form");
  await form.getByLabel("Email").fill(`e2e.nickname.${project}@tntech.edu`);
  await form.getByLabel("First name").fill("Bartholomew");
  await form.getByLabel("Preferred name (optional)").fill("Bart");
  await form.getByLabel("Last name").fill(`Tester${project}`);
  await form.getByLabel("Charge account (index)").selectOption({ label: `${code} - Test grant (${project})` });
  await form.getByLabel("Starting hourly rate ($)").fill("12.75");
  await pickPerson(page, "Supervisors", "sabrina", "Sabrina Supervisor", form);
  await pickPerson(page, "Supervisors", "marcus", "Marcus Reyes", form);
  await form.getByRole("button", { name: "Create user" }).click();
  await expect(page.locator(".user-management > .status-message")).toContainText(`Created e2e.nickname.${project}@tntech.edu`);

  await pickPerson(page, "Find people", `bart tester${project}`, `Bartholomew (Bart) Tester${project}`);
  const row = page.getByRole("row", { name: /Bartholomew \(Bart\)/ });
  await expect(row).toContainText(code);
  await expect(row).toContainText("Marcus Reyes, Sabrina Supervisor");
  await expectAccessible(page);
});
