import { test, expect } from "@playwright/test";
import { ACCOUNTS, expectAccessible, mockAccountTheme, signInToDashboard } from "./helpers";

for (const theme of ["light", "dark"] as const) {
  test(`student notification dismiss remains readable on hover and keyboard focus in ${theme} mode`, async ({ page }, testInfo) => {
    await mockAccountTheme(page, theme);
    await page.route("**/api/notifications", route => route.fulfill({ json: [{
      id: 99001, type: "TIME_CORRECTION_APPROVED", title: "Time correction approved",
      body: "Your time correction was approved.", senderName: "Sabrina",
    }] }));
    await page.route("**/api/notifications/99001", route => route.fulfill({ json: { success: true } }));
    if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/login");
    await expectAccessible(page);
    await signInToDashboard(page, ACCOUNTS.STUDENT);
    const updates = page.getByRole("region", { name: "Time request updates", exact: true });
    const dismiss = updates.getByRole("button", { name: "Dismiss time correction approved update", exact: true });
    await expect(dismiss).toBeVisible();
    await expectAccessible(page);
    // Mobile browsers can retain this hover state after a touch interaction.
    await dismiss.hover();
    await expectAccessible(page);
    await dismiss.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(dismiss).toBeFocused();
    await expect(dismiss).toHaveCSS("outline-style", "solid");
    await expectAccessible(page);
    await updates.screenshot({ path: testInfo.outputPath(`notification-hover-${theme}.png`) });
    await dismiss.click();
    await expect(updates).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Time request update dismissed." })).toHaveCount(1);
    await expectAccessible(page);
  });
}
