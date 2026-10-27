import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { ACCOUNTS, PEOPLE, SEED_PASSWORD, expectAccessible, mockAccountTheme, openSupervisorTool, signInToDashboard } from "./helpers";

for (const email of [ACCOUNTS.SUPERVISOR, PEOPLE.SECOND_SUPERVISOR]) {
  for (const theme of ["light", "dark"] as const) {
    test(`${email} keeps categories beside the clock and calendar in ${theme} mode`, async ({ page }, testInfo) => {
      test.setTimeout(90_000);
      await mockAccountTheme(page, theme);
      await page.route("**/api/notifications/todos", (route) => route.fulfill({ json: [] }));
      await page.goto("/login");
      await expectAccessible(page);
      await signInToDashboard(page, email);
      await expect(page.getByRole("status").filter({ hasText: "All Clear For Now!" })).toBeVisible();

      for (const width of [1366, 1024, 800, 320]) {
        await page.setViewportSize({ width, height: 900 });
        const clock = (await page.locator(".clock-widget").boundingBox())!;
        const calendar = (await page.locator(".supervisor-calendar").boundingBox())!;
        const todos = (await page.locator(".supervisor-todos").boundingBox())!;
        const tools = (await page.locator(".supervisor-tools").boundingBox())!;
        const cards = page.locator(".supervisor-tool");
        const first = (await cards.nth(0).boundingBox())!;
        const second = (await cards.nth(1).boundingBox())!;
        expect(calendar.y).toBeGreaterThan(clock.y + clock.height);
        expect(calendar.x).toBeCloseTo(clock.x, 0);
        expect(tools.y).toBeGreaterThan(todos.y + todos.height);
        if (width > 800) {
          expect(tools.x).toBeGreaterThanOrEqual(clock.x + clock.width);
          expect(todos.y).toBeCloseTo(clock.y, 0);
          expect(first.y).toBeLessThan(calendar.y);
          expect(todos.height).toBeLessThan(110);
        } else {
          expect(todos.y).toBeGreaterThan(calendar.y + calendar.height);
        }
        if (width === 1366) {
          expect(clock.width).toBeCloseTo(380, 0);
          expect(first.y).toBeCloseTo(second.y, 0);
          expect(second.x).toBeGreaterThan(first.x);
          await page.screenshot({ path: testInfo.outputPath(`supervisor-overview-${theme}.png`), fullPage: true });
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await expectAccessible(page);
      }
      await openSupervisorTool(page, "My Time Entries");
      await expect(page.getByRole("region", { name: "My recent time entries", exact: true })).toBeVisible();
      await expectAccessible(page);
    });
  }
}

for (const theme of ["light", "dark"] as const) {
  test(`supervisor categories expand with keyboard and retain drafts in ${theme} mode`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await mockAccountTheme(page, theme);
    await page.goto("/login");
    await expectAccessible(page);
    await page.getByLabel("Email").fill(ACCOUNTS.SUPERVISOR);
    await page.getByLabel("Password").fill(SEED_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator(".supervisor-tool")).toHaveCount(6);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
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
        await page.getByRole("button", { name: "View all students", exact: true }).click();
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

test("supervisors keep their own time entries in a category and clock above it", async ({ page }) => {
  await signInToDashboard(page, ACCOUNTS.SUPERVISOR);
  await expect(page.locator(".supervisor-organizer .clock-widget")).toBeVisible();
  await openSupervisorTool(page, "My Time Entries");
  await expect(page.locator(".clock-widget")).toHaveCount(1);
  await expect(page.getByRole("region", { name: "My recent time entries", exact: true })).toBeVisible();
  await expectAccessible(page);
});
