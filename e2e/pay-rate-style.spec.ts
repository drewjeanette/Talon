import { test, expect } from "@playwright/test";
import { ACCOUNTS, expectAccessible, mockAccountTheme, openAdminTool, openSupervisorTool, pickPerson, signInToDashboard } from "./helpers";

for (const role of ["ADMIN", "SUPERVISOR"] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`${role.toLowerCase()} pay rate inputs keep purple and gold trim in ${theme} mode`, async ({ page }, testInfo) => {
      await mockAccountTheme(page, theme);
      await page.goto("/login");
      await expectAccessible(page);
      await signInToDashboard(page, ACCOUNTS[role]);
      if (role === "ADMIN") await openAdminTool(page, "Time Entry Approvals");
      else await openSupervisorTool(page, "Student Hourly Pay Rates");
      const section = page.locator(".pay-rate-manager");
      await pickPerson(page, "Find students", "chris student", "Chris Student", section);
      const rate = section.getByRole("spinbutton", { name: /^Chris Student/ });
      await rate.fill("11.40");
      await expect(section.getByRole("button", { name: "Save rate", exact: true })).toBeEnabled();
      const search = section.getByRole("combobox", { name: "Find students" });
      for (const field of [search, rate]) {
        await field.focus();
        const style = await field.evaluate((element) => {
          const css = getComputedStyle(element);
          return { border: css.borderLeftColor, width: css.borderLeftWidth, shadow: css.boxShadow, outline: css.outlineStyle };
        });
        expect(style.border).toBe(theme === "dark" ? "rgb(185, 155, 229)" : "rgb(81, 40, 136)");
        expect(style.width).toBe("2px");
        expect(style.shadow).toContain("inset");
        expect(style.shadow).toContain(theme === "dark" ? "rgb(255, 215, 102)" : "rgb(255, 202, 40)");
        expect(style.outline).toBe("solid");
      }
      await expectAccessible(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await section.screenshot({ path: testInfo.outputPath(`pay-rate-trim-${role.toLowerCase()}-${theme}.png`) });
    });
  }
}
