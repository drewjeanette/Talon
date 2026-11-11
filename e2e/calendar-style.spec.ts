import { test, expect } from "@playwright/test";
import { ACCOUNTS, expectAccessible, mockAccountTheme, signInToDashboard } from "./helpers";

test("staff calendars show the green dot only while a supervisor is clocked in", async ({ page, browser, baseURL }) => {
  test.setTimeout(60_000);
  const adminContext = await browser.newContext({ baseURL });
  const admin = await adminContext.newPage();
  try {
    await page.clock.setFixedTime(new Date("2026-11-11T18:00:00Z"));
    await admin.clock.install({ time: new Date("2026-11-11T18:00:00Z") });
    for (const [view, email] of [[page, ACCOUNTS.SUPERVISOR], [admin, ACCOUNTS.ADMIN]] as const) {
      await view.goto("/login");
      await expectAccessible(view);
      await signInToDashboard(view, email);
      await view.getByRole("checkbox", { name: "Show Who’s Working" }).check();
      await expect(view.locator(".staff-schedule__panel").getByText("Sabrina", { exact: true })).toBeVisible();
      await expect(view.locator(".staff-schedule__clocked-in")).toHaveCount(0);
    }
    const clock = page.getByRole("region", { name: "Web Clock", exact: true });
    const supervisorDot = page.locator(".staff-schedule__clocked-in").filter({ hasText: "Sabrina" });
    const adminDot = admin.locator(".staff-schedule__clocked-in").filter({ hasText: "Sabrina" });
    await clock.getByRole("button", { name: "Clock In", exact: true }).click();
    await expect(supervisorDot).toContainText("Clocked in");
    await admin.clock.fastForward(60_000);
    await expect(adminDot).toContainText("Clocked in");
    await expectAccessible(page);
    await expectAccessible(admin);
    await admin.locator(".admin-calendar").getByText("12", { exact: true }).click();
    await expect(adminDot).toHaveCount(0);
    await admin.locator(".admin-calendar").getByText("11", { exact: true }).click();
    await expect(adminDot).toBeVisible();

    await clock.getByRole("button", { name: "Clock Out", exact: true }).click();
    await expect(supervisorDot).toHaveCount(0);
    await admin.clock.fastForward(60_000);
    await expect(adminDot).toHaveCount(0);
    await expect(admin.locator(".staff-schedule__panel").getByText("Sabrina", { exact: true })).toBeVisible();
  } finally {
    const clockOut = page.getByRole("button", { name: "Clock Out", exact: true });
    if (await clockOut.isEnabled({ timeout: 1000 }).catch(() => false)) await clockOut.click();
    await adminContext.close();
  }
});

for (const role of ["ADMIN", "SUPERVISOR"] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`${role.toLowerCase()} calendar has no added outline and working month navigation in ${theme} mode`, async ({ page }, testInfo) => {
      await mockAccountTheme(page, theme);
      await page.clock.setFixedTime(new Date("2026-11-11T18:00:00Z"));
      if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 320, height: 900 });
      await page.goto("/login");
      await expectAccessible(page);
      await signInToDashboard(page, ACCOUNTS[role]);
      const calendar = page.locator(role === "ADMIN" ? ".admin-calendar" : ".supervisor-calendar");
      await expect(calendar).toBeVisible();
      const border = await calendar.evaluate((element) => {
        const style = getComputedStyle(element);
        return { widths: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth], color: style.borderTopColor };
      });
      expect(border.widths).toEqual(role === "ADMIN" ? ["1px", "0px", "0px", "0px"] : Array(4).fill("1px"));
      expect(border.color).not.toBe(theme === "dark" ? "rgb(185, 155, 229)" : "rgb(81, 40, 136)");
      const heading = calendar.getByRole("heading", { level: 3 });
      const currentMonth = await heading.innerText();
      const next = calendar.getByRole("button", { name: "Next month", exact: true });
      await next.focus();
      await next.press("Enter");
      await expect(heading).not.toHaveText(currentMonth);
      await calendar.getByRole("button", { name: "Previous month", exact: true }).click();
      await expect(heading).toHaveText(currentMonth);

      const showSchedule = calendar.getByRole("checkbox", { name: "Show Who’s Working" });
      await expect(calendar.getByText("Scheduled shifts · Central time")).toBeHidden();
      await showSchedule.check();
      const wednesday = calendar.getByRole("radio", { name: "Wednesday, November 11, 2026" });
      await expect(wednesday).toBeChecked();
      for (const name of ["Rene", "Sabrina", "Leslie", "Seth"]) {
        await expect(calendar.getByText(name, { exact: true })).toBeVisible();
      }
      await expect(calendar.getByText("8 AM – 5 PM")).toBeVisible();
      await wednesday.press("ArrowRight");
      await expect(calendar.getByRole("radio", { name: "Thursday, November 12, 2026" })).toBeChecked();
      await expect(calendar.getByText("Seth", { exact: true })).toBeHidden();
      await calendar.getByText("14", { exact: true }).click();
      await expect(calendar.getByText("No staff scheduled.")).toBeVisible();
      await calendar.getByText("10", { exact: true }).click();
      await expect(calendar.getByText("Leslie", { exact: true })).toBeVisible();
      await expect(calendar.getByText("Sabrina", { exact: true })).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expectAccessible(page);
      await showSchedule.uncheck();
      await expect(calendar.getByText("Leslie", { exact: true })).toBeHidden();
      await calendar.screenshot({ path: testInfo.outputPath(`calendar-${role.toLowerCase()}-${theme}.png`) });
    });
  }
}
