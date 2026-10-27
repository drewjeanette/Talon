import { test, expect } from "@playwright/test";
import { ACCOUNTS, expectAccessible, mockAccountTheme, signInToDashboard } from "./helpers";

for (const role of ["ADMIN", "SUPERVISOR"] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`${role.toLowerCase()} calendar has purple trim and working month navigation in ${theme} mode`, async ({ page }, testInfo) => {
      await mockAccountTheme(page, theme);
      await page.goto("/login");
      await expectAccessible(page);
      await signInToDashboard(page, ACCOUNTS[role]);
      const calendar = page.locator(role === "ADMIN" ? ".admin-calendar" : ".supervisor-calendar");
      await expect(calendar).toBeVisible();
      const border = await calendar.evaluate((element) => {
        const style = getComputedStyle(element);
        return [style.borderTop, style.borderRight, style.borderBottom, style.borderLeft];
      });
      expect(border).toEqual(Array(4).fill(`2px solid ${theme === "dark" ? "rgb(185, 155, 229)" : "rgb(81, 40, 136)"}`));
      const heading = calendar.getByRole("heading", { level: 3 });
      const currentMonth = await heading.innerText();
      const next = calendar.getByRole("button", { name: "Next month", exact: true });
      await next.focus();
      await next.press("Enter");
      await expect(heading).not.toHaveText(currentMonth);
      await calendar.getByRole("button", { name: "Previous month", exact: true }).click();
      await expect(heading).toHaveText(currentMonth);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expectAccessible(page);
      await calendar.screenshot({ path: testInfo.outputPath(`calendar-trim-${role.toLowerCase()}-${theme}.png`) });
    });
  }
}
