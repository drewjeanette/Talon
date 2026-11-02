import { test, expect } from "@playwright/test";
import { ACCOUNTS, expectAccessible, openAdminTool, openSupervisorTool, signInToDashboard } from "./helpers";

for (const role of ["ADMIN", "SUPERVISOR"] as const) {
  test(`${role.toLowerCase()} approval headings align for populated and empty tables`, async ({ page }, testInfo) => {
    await page.goto("/login");
    await expectAccessible(page);
    await signInToDashboard(page, ACCOUNTS[role]);
    const openApprovals = () => role === "ADMIN"
      ? openAdminTool(page, "Time Entry Approvals")
      : openSupervisorTool(page, "Time Entry Approvals");
    await openApprovals();
    const queue = page.locator(".approval-queue");
    await expect(queue.getByRole("rowheader").first()).toBeVisible();
    await queue.getByRole("button", { name: /^Deny time entry for/ }).first().click();
    const denial = queue.locator(".approval-rejection-form");
    await expect(denial.getByRole("textbox", { name: "Reason for denial" })).toBeVisible();
    expect(await denial.evaluate(form => {
      const cell = form.closest("td")!.getBoundingClientRect();
      const bounds = form.getBoundingClientRect();
      return bounds.left >= cell.left && bounds.right <= cell.right;
    })).toBe(true);
    await expectAccessible(page);
    await denial.getByRole("button", { name: "Cancel", exact: true }).click();

    for (const empty of [false, true]) {
      if (empty) {
        await page.route(/\/api\/timeclock\/(pending|correction-requests\/pending)$/, route => route.fulfill({ json: [] }));
        await page.reload();
        await openApprovals();
        await expect(queue.getByRole("rowheader")).toHaveCount(0);
        await expect(queue).toContainText("There are no regular time entries waiting for approval.");
        await expect(queue).toContainText("There are no missed-punch or correction requests waiting for approval.");
      }
      const columns = await queue.locator("table").evaluateAll(tables => tables.map(table => {
        const start = table.getBoundingClientRect().left;
        return Array.from(table.querySelectorAll("thead th"), heading => {
          const rect = heading.getBoundingClientRect();
          return { left: rect.left - start, width: rect.width };
        });
      }));
      expect(columns).toHaveLength(2);
      expect(columns[0]).toHaveLength(6);
      for (let i = 0; i < 6; i++) {
        expect(Math.abs(columns[0][i].left - columns[1][i].left)).toBeLessThan(1);
        expect(Math.abs(columns[0][i].width - columns[1][i].width)).toBeLessThan(1);
      }
      await expectAccessible(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await queue.screenshot({ path: testInfo.outputPath(`aligned-${empty ? "empty" : "populated"}-approvals.png`) });
    }
    if (testInfo.project.name === "mobile") {
      await page.setViewportSize({ width: 320, height: 740 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expectAccessible(page);
    }
  });
}
