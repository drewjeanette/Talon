import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { ACCOUNTS, PEOPLE, SEED_PASSWORD, expectAccessible, openSupervisorTool, signInToDashboard } from "./helpers";

for (const theme of ["light", "dark"] as const) {
  test(`supervisor categories expand with keyboard and retain drafts in ${theme} mode`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.addInitScript((value) => localStorage.setItem("talon-theme", value), theme);
    await page.goto("/login");
    await expectAccessible(page);
    await page.getByLabel("Email").fill(ACCOUNTS.SUPERVISOR);
    await page.getByLabel("Password").fill(SEED_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator(".supervisor-tool")).toHaveCount(5);
    await expect(page.locator(".supervisor-tool[open]")).toHaveCount(0);
    await expectAccessible(page);
    await page.locator(".supervisor-tools").screenshot({ path: testInfo.outputPath(`supervisor-categories-${theme}.png`) });

    const approvals = page.locator(".supervisor-tool").filter({ has: page.locator(".approval-queue") });
    const summary = approvals.locator("summary");
    await summary.focus();
    await summary.press("Enter");
    await expect(page.getByRole("heading", { name: "Missed punches & correction requests", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Reviewed time changes", exact: true })).toHaveCount(0);
    await approvals.getByRole("button", { name: "Deny time entry for Chris Student", exact: true }).first().click();
    const reason = approvals.getByLabel("Reason for denial");
    await expect(reason).toBeFocused();
    await reason.fill("Please check the clock-out time.");
    await expectAccessible(page);
    await summary.focus();
    await summary.press("Space");
    await expect(reason).toBeHidden();
    await summary.press("Enter");
    await expect(reason).toHaveValue("Please check the clock-out time.");
    await expect(reason).toBeVisible();
    await reason.focus();
    await approvals.screenshot({ path: testInfo.outputPath(`supervisor-input-trim-${theme}.png`) });
    await approvals.getByRole("button", { name: "Cancel", exact: true }).click();
    await summary.click();

    for (const title of ["Student Pay Stubs", "Student Hourly Pay Rates", "Payroll Reports", "My Pay Stubs"]) {
      await openSupervisorTool(page, title);
      await expectAccessible(page);
      if (title === "Student Hourly Pay Rates") {
        const rate = page.getByRole("spinbutton", { name: /^Chris Student/ });
        await rate.fill("12.75");
        await page.locator(".supervisor-tool > summary").filter({ hasText: title }).click();
        await openSupervisorTool(page, title);
        await expect(rate).toHaveValue("12.75");
      }
      if (title === "My Pay Stubs") {
        const [download] = await Promise.all([
          page.waitForEvent("download"),
          page.locator(".pay-stubs").getByRole("button", { name: /Download PDF/ }).first().click(),
        ]);
        expect(readFileSync(await download.path()).subarray(0, 5).toString()).toBe("%PDF-");
      }
      await page.locator(".supervisor-tool > summary").filter({ hasText: title }).click();
    }

    await page.setViewportSize({ width: 320, height: 900 });
    await openSupervisorTool(page, "Student Hourly Pay Rates");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expectAccessible(page);
    await page.locator(".supervisor-tools").screenshot({ path: testInfo.outputPath(`supervisor-mobile-${theme}.png`) });
  });
}

test("supervisor to-dos open the matching category and remain until the work is done", async ({ page }) => {
  await page.route("**/api/notifications/todos", (route) => route.fulfill({ json: [
    { key: "corrections", label: "Review time corrections", detail: "A correction needs review.", count: 1, target: "approvals", since: null },
    { key: "stub-questions", label: "Answer pay stub questions", detail: "A question needs an answer.", count: 1, target: "approvals", since: null },
    { key: "report-ready", label: "Review the payroll report", detail: "Payroll is ready to review.", count: 1, target: "report", since: null },
  ] }));
  await signInToDashboard(page, PEOPLE.SECOND_SUPERVISOR);
  await expectAccessible(page);
  for (const [label, heading] of [
    ["Review time corrections", "#approvals-heading"],
    ["Answer pay stub questions", "#team-paystubs-heading"],
    ["Review the payroll report", "#report-heading"],
  ]) {
    const todo = page.getByRole("region", { name: "To-Dos", exact: true }).getByRole("button", { name: new RegExp(label) });
    await todo.click();
    await expect(page.locator(heading)).toBeFocused();
    await expect(page.locator(heading)).toBeVisible();
    await expect(todo).toBeEnabled();
    await expectAccessible(page);
  }
});

test("biweekly supervisors keep their own web clock inside a category", async ({ page }) => {
  await page.route("**/api/auth/login", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, user: { ...body.user, payType: "BIWEEKLY" } } });
  });
  await signInToDashboard(page, ACCOUNTS.SUPERVISOR);
  await openSupervisorTool(page, "My Web Clock & Time Entries");
  await expect(page.getByRole("button", { name: "Clock In", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "My recent time entries", exact: true })).toBeVisible();
  await expectAccessible(page);
});
