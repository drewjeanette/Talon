import { test, expect } from "@playwright/test";
import { PEOPLE, SEED_PASSWORD, expectAccessible, mockAccountTheme } from "./helpers";

for (const theme of ["light", "dark"] as const) {
  test(`student dashboard keeps clock and to-dos compact in ${theme} mode`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await mockAccountTheme(page, theme);
    await page.clock.install({ time: new Date("2030-01-20T18:00:00Z") });
    await page.route("**/api/payroll/timecard-periods", route => route.fulfill({ json: [
      { startDate: "2030-01-07T00:00:00Z", endDate: "2030-01-20T23:59:59Z" },
    ] }));
    // A long current timecard reproduces the stretched clock in the reported layout.
    await page.route("**/api/timeclock/my-entries", (route) => route.fulfill({ json:
      Array.from({ length: 12 }, (_, index) => ({
        id: 9000 + index,
        clockIn: `2030-01-${String(20 - index).padStart(2, "0")}T14:00:00.000Z`,
        clockOut: `2030-01-${String(20 - index).padStart(2, "0")}T16:00:00.000Z`,
        status: "REJECTED", reviewedBy: "Test Supervisor",
      })),
    }));
    await page.route("**/api/notifications/todos", (route) => route.fulfill({ json: [{
      key: "rejected-time", label: "Fix rejected time", count: 12, target: "time",
      detail: "12 time entries were rejected. Send a correction with the right times.", since: null,
    }] }));
    await page.goto("/login");
    await expectAccessible(page);
    await page.getByLabel("Email").fill(PEOPLE.KATHERINE);
    await page.getByLabel("Password").fill(SEED_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    const clock = page.getByRole("region", { name: "Web Clock", exact: true });
    const todos = page.getByRole("region", { name: "To-Dos", exact: true });
    const timecard = page.getByRole("region", { name: "Current Timecard", exact: true });
    await expect(timecard.locator("tbody tr")).toHaveCount(12);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

    const desktopWidth = 1280;
    let clockWidthWithTodos = 0;
    for (const width of [desktopWidth, 640, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(todos).toBeVisible();
      const clockBox = (await clock.boundingBox())!;
      const todoBox = (await todos.boundingBox())!;
      const timecardBox = (await timecard.boundingBox())!;
      if (width === desktopWidth) {
        clockWidthWithTodos = clockBox.width;
        expect(Math.abs(clockBox.y - todoBox.y)).toBeLessThan(1);
        expect(Math.abs(clockBox.width - todoBox.width)).toBeLessThan(1);
        expect(Math.abs(clockBox.height - todoBox.height)).toBeLessThan(1);
        expect(clockBox.height).toBeLessThan(300);
      } else {
        expect(todoBox.y).toBeGreaterThanOrEqual(clockBox.y + clockBox.height);
      }
      expect(timecardBox.y).toBeGreaterThanOrEqual(todoBox.y + todoBox.height);
      expect(timecardBox.width).toBeGreaterThanOrEqual(clockBox.width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expectAccessible(page);
      await page.screenshot({ path: testInfo.outputPath(`student-${theme}-${width}.png`), fullPage: true });
    }

    await todos.getByRole("button", { name: /Fix rejected time/ }).click();
    await expect(page.locator(".student-time-tools")).toBeInViewport();
    await expect(todos.getByRole("button", { name: /Fix rejected time/ })).toBeEnabled();

    // Hiding an empty to-do list should leave the desktop clock the same width.
    await page.route("**/api/notifications/todos", (route) => route.fulfill({ json: [] }));
    await page.setViewportSize({ width: desktopWidth, height: 900 });
    await page.reload();
    await expect(todos).toHaveCount(0);
    await expect(timecard.locator("tbody tr")).toHaveCount(12);
    const clockBox = (await clock.boundingBox())!;
    expect(clockBox.width).toBeCloseTo(clockWidthWithTodos, 0);
    expect(clockBox.width).toBeLessThan((await timecard.boundingBox())!.width / 2);
    expect(clockBox.height).toBeLessThan(220);
    await expectAccessible(page);
  });
}
