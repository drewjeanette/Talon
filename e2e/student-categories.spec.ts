import { test, expect } from "@playwright/test";
import { PEOPLE, expectAccessible, mockAccountTheme, openStudentCategory, signInToDashboard } from "./helpers";

for (const theme of ["light", "dark"] as const) {
  test(`student categories keep secondary lists closed and open corrections from a notification in ${theme} mode`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await mockAccountTheme(page, theme);
    await page.route("**/api/notifications/todos", route => route.fulfill({ json: [{
      key: "rejected-time", label: "Fix rejected time", detail: "Send a correction for rejected time.", count: 1, target: "time", since: null,
    }] }));
    await page.route("**/api/timeclock/correction-requests/mine", route => route.fulfill({ json: [1, 2].map(id => ({
      id, timeEntryId: null, requestedClockIn: "2026-10-20T14:00:00Z", requestedClockOut: "2026-10-20T16:00:00Z",
      reason: `Missed shift ${id}`, status: "PENDING", reviewerName: null, reviewerReason: null,
      waitingOn: ["Sabrina Supervisor"], createdAt: new Date().toISOString(),
    })) }));
    if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/login");
    await expectAccessible(page);
    await signInToDashboard(page, PEOPLE.KATHERINE);
    const current = page.getByRole("region", { name: "Current Timecard", exact: true });
    const todos = page.getByRole("region", { name: "To-Dos", exact: true });
    await expect(current.locator("table")).toBeVisible();
    await expect(page.getByRole("region", { name: "Web Clock", exact: true })).toBeVisible();
    await expect(todos.getByRole("button", { name: /Fix rejected time/ })).toBeVisible();
    const categories = page.locator("details.student-category");
    await expect(categories).toHaveCount(3);
    await expect(page.locator("details.student-category[open]")).toHaveCount(0);
    for (const selector of [".student-time-tools", ".talon-past-timecards", ".pay-stubs"]) await expect(page.locator(selector)).toBeHidden();
    await expect(page.getByRole("region", { name: "My recent time entries" })).toHaveCount(0);
    const currentBounds = (await current.boundingBox())!;
    for (const category of await categories.all()) expect((await category.boundingBox())!.y).toBeGreaterThanOrEqual(currentBounds.y + currentBounds.height);
    await expectAccessible(page);
    await page.screenshot({ path: testInfo.outputPath(`student-overview-${theme}.png`), fullPage: true });

    const corrections = page.locator(".student-category--corrections");
    const summary = corrections.locator(":scope > summary");
    await summary.focus();
    await page.keyboard.press("Space");
    await expect(corrections).toHaveAttribute("open", "");
    const tools = page.locator(".student-time-tools");
    await expect(tools.locator(".correction-history li")).toHaveCount(2);
    await tools.getByRole("button", { name: "Fix a missed clock-in or clock-out" }).click();
    const reason = tools.getByLabel("Reason for the correction");
    await reason.fill("Draft correction to finish later");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(tools).toBeHidden();
    await page.keyboard.press("Enter");
    await expect(reason).toHaveValue("Draft correction to finish later");
    await tools.getByRole("button", { name: "Cancel", exact: true }).click();
    await summary.click();

    // Notification shortcuts open the category; viewing work does not clear it.
    await todos.getByRole("button", { name: /Fix rejected time/ }).click();
    await expect(corrections).toHaveAttribute("open", "");
    await expect(page.locator("#time-help-heading")).toBeFocused();
    await expect(todos.locator(".work-queue__count")).toHaveText("1");
    await expectAccessible(page);
    await corrections.screenshot({ path: testInfo.outputPath(`student-corrections-${theme}.png`) });

    await openStudentCategory(page, "Pay Stubs");
    await expect(page.locator(".pay-stubs table")).toBeVisible();
    await expect(corrections).not.toHaveAttribute("open", "");
    await openStudentCategory(page, "Past Timecards");
    await expect(page.getByRole("region", { name: "Past Timecards", exact: true })).toBeVisible();
    const openCategories = page.locator("details.student-category[open]");
    await expect(openCategories).toHaveCount(1);
    await expectAccessible(page);

    await openCategories.getByRole("button", { name: "Back to Categories" }).click();
    await expect(openCategories).toHaveCount(0);
    await expect(categories.first().locator(":scope > summary")).toBeFocused();
    await expect(categories.first().locator(":scope > summary")).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(openCategories).toHaveCount(1);
    await todos.getByRole("button", { name: /Fix rejected time/ }).click();
    await expect(openCategories).toHaveCount(1);
    await expect(corrections).toHaveAttribute("open", "");
    await expect(page.locator("#time-help-heading")).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expectAccessible(page);
  });
}
