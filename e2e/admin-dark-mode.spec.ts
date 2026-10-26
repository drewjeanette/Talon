import { test, expect } from "@playwright/test";
import { ACCOUNTS, expectAccessible, openAdminTool, pickPerson, signInToDashboard } from "./helpers";

test("admin dark mode keeps notifications and every admin tool readable", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => localStorage.setItem("talon-theme", "dark"));
  await signInToDashboard(page, ACCOUNTS.ADMIN);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const todos = page.getByRole("region", { name: "Work to Do", exact: true });
  await expect(todos.getByRole("button").first()).toBeVisible();
  await expectAccessible(page);
  await todos.getByRole("button").first().hover();
  await expectAccessible(page);
  await todos.screenshot({ path: testInfo.outputPath("admin-dark-notifications.png") });

  for (const tool of ["Time Entry Approvals", "Generate Payroll and Pay Periods", "User Management", "Departments & Colleges", "My Pay Stubs"]) {
    await openAdminTool(page, tool);
    await expectAccessible(page);
    if (tool === "User Management") {
      await page.getByRole("button", { name: "Student Reports", exact: true }).click();
      await pickPerson(page, "Students in report", "sophie", "Sophia (Sophie) Wells");
      await pickPerson(page, "Students in report", "liz", "Elizabeth (Liz) Park");
      await pickPerson(page, "Students in report", "chris student", "Chris Student");
      await expect(page.getByRole("button", { name: "Print report", exact: true })).toBeEnabled();
      await expectAccessible(page);
      await page.getByRole("region", { name: "Student Reports", exact: true }).screenshot({ path: testInfo.outputPath("student-reports-dark.png") });
      await page.setViewportSize({ width: 320, height: 740 });
      await expectAccessible(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.setViewportSize(testInfo.project.use.viewport!);
      await page.getByRole("button", { name: "Back to user list", exact: true }).click();
      await page.getByRole("button", { name: "Edit Chris Student", exact: true }).click();
      await expectAccessible(page);
    }
    if (tool === "Generate Payroll and Pay Periods") {
      const report = page.locator(".payroll-report");
      await report.getByRole("checkbox", { name: "Compare Chris Student", exact: true }).check();
      await report.getByRole("checkbox", { name: "Compare Sophia (Sophie) Wells", exact: true }).check();
      await report.getByRole("button", { name: "Compare selected (2)", exact: true }).click();
      await expectAccessible(page);
    }
    await page.getByRole("button", { name: "Back to Overview", exact: true }).click();
  }
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  for (const tab of ["Notifications", "Account", "Appearance"]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await expectAccessible(page);
  }
});
