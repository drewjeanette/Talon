import { test, expect } from "@playwright/test";
import { ACCOUNTS, PEOPLE, SEED_PASSWORD, expectAccessible, openSupervisorTool } from "./helpers";

for (const payType of ["MONTHLY", "BIWEEKLY"] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`${payType.toLowerCase()} supervisor has a top-left live web clock in ${theme} mode`, async ({ page }, testInfo) => {
      test.setTimeout(60_000);
      await page.addInitScript((value) => localStorage.setItem("talon-theme", value), theme);
      const email = payType === "MONTHLY" ? ACCOUNTS.SUPERVISOR : PEOPLE.SECOND_SUPERVISOR;
      // Exercise both account settings without changing the demo accounts' payroll setup.
      await page.route(/\/api\/auth\/(login|me)$/, async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        const json = route.request().url().endsWith("/login")
          ? { ...body, user: { ...body.user, payType } }
          : { ...body, payType };
        await route.fulfill({ response, json });
      });
      await page.goto("/login");
      await expectAccessible(page);
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(SEED_PASSWORD);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      const clock = page.getByRole("region", { name: "Web Clock", exact: true });
      const clockIn = clock.getByRole("button", { name: "Clock In", exact: true });
      const clockOut = clock.getByRole("button", { name: "Clock Out", exact: true });
      await expect(clock).toBeVisible();
      await expect(clockIn).toBeEnabled();
      await expect(clockOut).toBeDisabled();
      await clockIn.click();
      await expect(clockOut).toBeEnabled();
      await expect(clockIn).toBeDisabled();
      const elapsed = clock.locator(".clock-widget__elapsed strong");
      await expect(elapsed).toHaveText(/^\d{2,}:\d{2}:\d{2}$/);
      const initialElapsed = await elapsed.innerText();
      await expect.poll(() => elapsed.innerText()).not.toBe(initialElapsed);
      const seconds = (value: string) => value.split(":").reduce((total, part) => total * 60 + Number(part), 0);
      const beforeReload = seconds(await elapsed.innerText());
      await page.reload();
      await expect(clockOut).toBeEnabled();
      await expect.poll(async () => seconds(await elapsed.innerText())).toBeGreaterThanOrEqual(beforeReload);

      for (const width of [1280, 640, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await expectAccessible(page);
        const clockBox = (await clock.boundingBox())!;
        const titleBox = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
        const todosBox = (await page.locator(".supervisor-todos").boundingBox())!;
        const calendarBox = (await page.locator(".supervisor-calendar").boundingBox())!;
        expect(clockBox.x).toBeCloseTo(titleBox.x, 0);
        expect(clockBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height);
        expect(clockBox.y).toBeLessThanOrEqual(todosBox.y + 1);
        expect(calendarBox.x).toBeCloseTo(clockBox.x, 0);
        expect(calendarBox.width).toBeCloseTo(clockBox.width, 0);
        expect(calendarBox.y).toBeGreaterThan(clockBox.y + clockBox.height);
        expect(clockBox.width).toBeGreaterThan(250);
        if (width === 1280) {
          expect(clockBox.x + clockBox.width).toBeLessThanOrEqual(todosBox.x);
        } else if (width <= 800) {
          expect(todosBox.y).toBeGreaterThan(calendarBox.y + calendarBox.height);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.locator(".supervisor-organizer").screenshot({ path: testInfo.outputPath(`clock-${theme}-${width}.png`) });
      }

      await clockOut.click();
      await expect(clockIn).toBeEnabled();
      await expect(clockOut).toBeDisabled();
      await expect(clock.locator(".clock-widget__elapsed")).toContainText("Last shift:");
      await openSupervisorTool(page, "My Time Entries");
      const history = page.getByRole("region", { name: "My recent time entries", exact: true });
      await expect(history.locator("tbody tr").first()).toContainText("PENDING");
      await expect(history.locator("tbody tr").first()).not.toContainText("In progress");
      await expectAccessible(page);
    });
  }
}

test("supervisor Clock Out remains readable on hover in dark mode", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("talon-theme", "dark"));
  await page.route("**/api/timeclock/my-entries", (route) => route.fulfill({ json: [{
    id: 90001, clockIn: new Date(Date.now() - 60_000).toISOString(), clockOut: null, status: "PENDING",
  }] }));
  await page.goto("/login");
  await expectAccessible(page);
  await page.getByLabel("Email").fill(ACCOUNTS.SUPERVISOR);
  await page.getByLabel("Password").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const clockOut = page.getByRole("region", { name: "Web Clock", exact: true }).getByRole("button", { name: "Clock Out", exact: true });
  await expect(clockOut).toBeEnabled();
  await clockOut.hover();
  await expectAccessible(page);
});
