import { test, expect } from "@playwright/test";
import { ACCOUNTS, PEOPLE, expectAccessible, signInToDashboard } from "./helpers";

for (const profile of [
  { email: ACCOUNTS.ADMIN, name: "Renee", role: "admin" },
  { email: ACCOUNTS.STUDENT, name: "Chris", role: "student" },
  { email: ACCOUNTS.SUPERVISOR, name: "Sabrina", role: "supervisor" },
  { email: PEOPLE.SECOND_SUPERVISOR, name: "Leslie", role: "supervisor" },
]) {
  for (const theme of ["light", "dark"] as const) {
    test(`${profile.name}'s ${profile.role} banner has standard dimensions in ${theme} mode`, async ({ page }, testInfo) => {
      test.setTimeout(60_000);
      await page.route(/\/api\/auth\/(login|me)$/, async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        const account = body.user ?? body;
        Object.assign(account, { theme, preferredName: profile.name });
        await route.fulfill({ response, json: body });
      });
      await page.goto("/login");
      await expectAccessible(page);
      await signInToDashboard(page, profile.email);
      const banner = page.getByRole("banner");
      const roleLabel = banner.locator(".app-header__role");
      await expect(roleLabel).toHaveText(profile.role.toUpperCase());
      await expect(roleLabel).toHaveCSS("color", "rgb(255, 255, 255)");
      await expect(roleLabel).toHaveCSS("font-weight", "800");
      for (const width of [1366, 1024, 900, 768, 600, 393, 320]) {
        await page.setViewportSize({ width, height: 900 });
        const bounds = (await banner.boundingBox())!;
        expect(bounds.x).toBe(0);
        expect(bounds.y).toBe(0);
        expect(bounds.width).toBe(width);
        expect(bounds.height).toBe(width > 900 ? 80 : width > 600 ? 112 : 160);
        for (const element of [banner.getByRole("navigation", { name: "Primary" }), banner.getByRole("button", { name: "Log out" }), banner.getByRole("link", { name: "Settings", exact: true })]) {
          const box = (await element.boundingBox())!;
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(width);
          expect(box.y + box.height).toBeLessThanOrEqual(bounds.height);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        if (width === 1366 || width === 320) {
          await expectAccessible(page);
          await banner.screenshot({ path: testInfo.outputPath(`banner-${profile.name}-${theme}-${width}.png`) });
        }
      }
    });
  }
}
