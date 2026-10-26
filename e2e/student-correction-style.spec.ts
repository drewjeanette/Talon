import { test, expect } from "@playwright/test";
import { PEOPLE, SEED_PASSWORD, expectAccessible } from "./helpers";

for (const theme of ["light", "dark"] as const) {
  test(`student correction fields remain usable with trim in ${theme} mode`, async ({ page }, testInfo) => {
    await page.addInitScript((value) => localStorage.setItem("talon-theme", value), theme);
    await page.goto("/login");
    await expectAccessible(page);
    await page.getByLabel("Email").fill(PEOPLE.LIZ);
    await page.getByLabel("Password").fill(SEED_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("button", { name: "Fix a missed clock-in or clock-out" }).click();
    const form = page.locator(".student-time-tools__card");
    const shift = form.getByLabel("Shift to correct");
    const job = form.getByLabel("Job", { exact: true });
    const clockIn = form.getByLabel("Correct clock-in", { exact: true });
    const clockOut = form.getByLabel("Correct clock-out", { exact: true });
    const reason = form.getByLabel("Reason for the correction");
    await expect(shift).toBeFocused();
    await expect(job).toBeVisible();
    await shift.press("Tab");
    await expect(job).toBeFocused();
    await job.selectOption({ index: 1 });

    let submissions = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().endsWith("/timeclock/correction-requests")) submissions++;
    });
    await clockIn.fill("2026-10-20T09:00");
    await clockOut.fill("2026-10-20T11:00");
    await reason.fill("I forgot to record this shift.");
    await expect(clockIn).toHaveValue("2026-10-20T09:00");
    await expect(clockOut).toHaveValue("2026-10-20T11:00");
    await expect(reason).toHaveValue("I forgot to record this shift.");
    await expectAccessible(page);

    for (const width of [1280, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await shift.focus();
      await reason.focus();
      await expect(reason).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expectAccessible(page);
      await form.screenshot({ path: testInfo.outputPath(`correction-${theme}-${width}.png`) });
    }
    expect(submissions).toBe(0);
    await form.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(form).toHaveCount(0);
  });
}
