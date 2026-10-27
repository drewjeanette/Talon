import { test, expect } from "@playwright/test";
import { ACCOUNTS, expectAccessible, openAdminTool, openSupervisorTool, pickPerson, signInToDashboard } from "./helpers";

for (const role of ["ADMIN", "SUPERVISOR"] as const) {
  test(`${role.toLowerCase()} searches pay rates first and browses a large list without losing drafts`, async ({ page }) => {
    test.setTimeout(90_000);
    // Expand only this local response to exercise pagination without creating accounts.
    await page.route(/\/api\/users$/, async (route) => {
      const response = await route.fetch();
      const users = await response.json() as { id: number; firstName: string; lastName: string }[];
      const chris = users.find((person) => person.firstName === "Chris" && person.lastName === "Student")!;
      await route.fulfill({ response, json: [chris, ...Array.from({ length: 22 }, (_, index) => ({
        ...chris, id: 9000 + index, firstName: "Test", lastName: `Student ${String(index + 1).padStart(2, "0")}`, preferredName: null,
      }))] });
    });
    await page.goto("/login");
    await expectAccessible(page);
    await signInToDashboard(page, ACCOUNTS[role]);
    if (role === "ADMIN") await openAdminTool(page, "Time Entry Approvals");
    else await openSupervisorTool(page, "Student Hourly Pay Rates");
    const rates = page.locator(".pay-rate-manager");
    await expect(rates.getByRole("combobox", { name: "Find students" })).toBeVisible();
    await expect(rates.getByRole("spinbutton")).toHaveCount(0);
    await expectAccessible(page);
    await pickPerson(page, "Find students", "chris", "Chris Student", rates);
    const chrisRate = rates.getByRole("spinbutton", { name: /^Chris Student/ });
    await expect(rates.getByRole("spinbutton")).toHaveCount(1);
    await chrisRate.fill("12.34");
    await rates.getByRole("button", { name: "View all students", exact: true }).click();
    await expect(rates.getByRole("spinbutton")).toHaveCount(10);
    await expect(rates.locator(".pay-rate-manager__browse").getByRole("status")).toHaveText("Showing 1–10 of 23 students.");
    const previous = rates.getByRole("button", { name: "Previous page", exact: true });
    const next = rates.getByRole("button", { name: "Next page", exact: true });
    await expect(previous).toBeDisabled();
    await next.click();
    await expect(rates.locator(".pay-rate-manager__browse").getByRole("status")).toHaveText("Showing 11–20 of 23 students.");
    await expect(chrisRate).toHaveCount(0);
    await previous.click();
    await expect(chrisRate).toHaveValue("12.34");
    await next.click();
    await next.click();
    await expect(rates.getByRole("spinbutton")).toHaveCount(3);
    await expect(next).toBeDisabled();
    await expectAccessible(page);
    await rates.getByRole("button", { name: "Search students only", exact: true }).click();
    await expect(rates.getByRole("spinbutton")).toHaveCount(0);
    await pickPerson(page, "Find students", "chris", "Chris Student", rates);
    await expect(chrisRate).toHaveValue("12.34");
    await pickPerson(page, "Find students", "student 22", "Test Student 22", rates);
    await expect(rates.getByRole("spinbutton")).toHaveCount(2);
    await rates.getByRole("button", { name: "Remove Chris Student", exact: true }).click();
    await rates.getByRole("button", { name: "Remove Test Student 22", exact: true }).click();
    await expect(rates.getByRole("spinbutton")).toHaveCount(0);
    await rates.getByRole("combobox", { name: "Find students" }).press("Escape");
    await page.setViewportSize({ width: 320, height: 900 });
    await rates.getByRole("button", { name: "View all students", exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expectAccessible(page);
  });
}
