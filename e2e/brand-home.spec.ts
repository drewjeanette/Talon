import { test, expect } from "@playwright/test";
import { ACCOUNTS, expectAccessible, signInToDashboard } from "./helpers";

for (const role of ["STUDENT", "SUPERVISOR", "ADMIN"] as const) {
  test(`${role.toLowerCase()} can return home using Talon or Dashboard with consistent brand alignment`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await page.goto("/login");
    await expectAccessible(page);
    await signInToDashboard(page, ACCOUNTS[role]);
    const banner = page.getByRole("banner");
    const brand = banner.getByRole("link", { name: "Talon home", exact: true });
    await expect(brand).toHaveAttribute("href", "/");
    await expectAccessible(page);

    for (const width of [1366, 768, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const homeBounds = (await brand.boundingBox())!;
      expect(homeBounds.x).toBeCloseTo(width > 600 ? Math.min(40, width * .04) : 16, 1);
      expect(homeBounds.height).toBe(36);
      await expect(brand).toHaveCSS("font-size", "23.2px");
      await expect(brand).toHaveCSS("font-weight", "700");
      await banner.getByRole("link", { name: "Settings", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
      expect(await brand.boundingBox()).toEqual(homeBounds);
      await expect(brand).toHaveCSS("text-decoration-line", "none");
      await brand.hover();
      await expect(brand).toHaveCSS("text-decoration-line", "underline");
      expect(await brand.boundingBox()).toEqual(homeBounds);
      await brand.focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      await expect(brand).toBeFocused();
      await expect(brand).toHaveCSS("outline-style", "solid");
      await expectAccessible(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (width === 320) await banner.screenshot({ path: testInfo.outputPath("settings-home-link.png") });
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Good");
    }

    await banner.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
    await banner.getByRole("link", { name: "Dashboard", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Good");
    await brand.click();
    await expect(page).toHaveURL(/\/$/);
    await expectAccessible(page);
  });
}
