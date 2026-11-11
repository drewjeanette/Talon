import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ACCOUNTS, PEOPLE, SEED_PASSWORD, expectAccessible, openAdminTool, openSupervisorTool, pickPerson, signInToDashboard } from "./helpers";

// The seed's previous bi-weekly period is generated: Chris and Sophie both earn
// $11.50/hour, but Sophie worked 5 hours of overtime and is charged to the
// NSF grant (G21047) even though her home department is Computer Science.

test("admin can use the trimmed payroll fields with keyboard focus", async ({ page }, testInfo) => {
  await signInToDashboard(page, ACCOUNTS.ADMIN);
  await openAdminTool(page, "Generate Payroll and Pay Periods");
  const form = page.locator(".pay-period-manager__form");
  const fieldLabels = ["Type", "Start date", "End date", "Pay date"];
  for (const label of fieldLabels) {
    const field = form.getByLabel(label, { exact: true });
    await expect(field).toHaveCSS("height", "48px");
    await expect(field).toHaveCSS("border-bottom-color", "rgb(154, 107, 0)");
  }
  if (testInfo.project.name === "desktop") {
    const tops = await form.locator("input, select").evaluateAll((fields) => fields.map((field) => field.getBoundingClientRect().top));
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
  }
  await form.getByLabel("Type", { exact: true }).selectOption("MONTHLY");
  await form.getByLabel("Type", { exact: true }).press("Tab");
  await expect(form.getByLabel("Start date", { exact: true })).toBeFocused();
  await form.getByLabel("Start date", { exact: true }).fill("2027-01-01");
  await form.getByLabel("End date", { exact: true }).fill("2027-01-31");
  await form.getByLabel("Pay date", { exact: true }).fill("2027-02-05");
  await expectAccessible(page);
  await form.screenshot({ path: testInfo.outputPath("payroll-fields.png") });
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  const darkFields = await new AxeBuilder({ page })
    .include(".pay-period-manager input:not([type='checkbox'])")
    .include(".pay-period-manager select")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(darkFields.violations).toEqual([]);
  await form.screenshot({ path: testInfo.outputPath("payroll-fields-dark.png") });
});

test("admin can correct a saved pay period without generated stubs", async ({ page, request }, testInfo) => {
  const month = testInfo.project.name === "mobile" ? "02" : "01";
  const login = await request.post("/api/auth/login", { data: { email: ACCOUNTS.ADMIN, password: SEED_PASSWORD } });
  expect(login.ok()).toBe(true);
  const { accessToken } = await login.json();
  const headers = { Authorization: `Bearer ${accessToken}` };
  const created = await request.post("/api/payroll/periods", { headers, data: {
    type: "BIWEEKLY", startDate: `2032-${month}-02T00:00:00Z`,
    endDate: `2032-${month}-15T00:00:00Z`, payDate: `2032-${month}-18T00:00:00Z`,
  } });
  expect(created.ok()).toBe(true);
  const { id } = await created.json();
  expect((await request.post(`/api/payroll/periods/${id}/finalize`, { headers })).ok()).toBe(true);

  await page.goto("/login");
  await expectAccessible(page);
  await signInToDashboard(page, ACCOUNTS.ADMIN);
  await openAdminTool(page, "Generate Payroll and Pay Periods");
  const edit = page.getByRole("button", { name: `Edit pay period ${Number(month)}/2/2032 through ${Number(month)}/15/2032` });
  await edit.click();
  const form = page.getByRole("form", { name: "Edit pay period" });
  await expect(form.getByLabel("Start date")).toBeFocused();
  await form.getByLabel("Start date").fill(`2032-${month}-01`);
  await form.getByLabel("End date").fill(`2032-${month}-14`);
  await expectAccessible(page);
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Pay period updated.")).toBeVisible();
  const updated = page.getByRole("button", { name: `Edit pay period ${Number(month)}/1/2032 through ${Number(month)}/14/2032` });
  await expect(updated).toBeFocused();
  await page.reload();
  await openAdminTool(page, "Generate Payroll and Pay Periods");
  await expect(updated).toBeEnabled();
  await expect(updated.locator("xpath=ancestor::tr")).toContainText("CLOSED");
  await expectAccessible(page);
});

test("admin compares two students side by side and sees which line items differ", async ({ page }) => {
  await signInToDashboard(page, ACCOUNTS.ADMIN);
  await openAdminTool(page, "Generate Payroll and Pay Periods");
  const report = page.locator(".payroll-report");
  await expect(report.locator(".talon-report-status")).toContainText("report lines loaded");

  for (const column of ["Regular hrs", "Regular pay", "Overtime hrs", "Overtime pay", "Total hrs", "Total pay", "Charge account"]) {
    await expect(report.getByRole("columnheader", { name: new RegExp(column) })).toBeVisible();
  }

  await pickPerson(page, "People", "chris student", "Chris Student");
  await pickPerson(page, "People", "sophie", "Sophia (Sophie) Wells");
  const table = report.getByRole("region", { name: "Payroll report table" });
  await expect(table.getByRole("rowheader")).toHaveText(["Chris Student", "Sophia (Sophie) Wells", "Total"]);

  await report.getByRole("checkbox", { name: "Compare Chris Student" }).check();
  await report.getByRole("checkbox", { name: "Compare Sophia (Sophie) Wells" }).check();
  await report.getByRole("button", { name: "Compare selected (2)" }).click();

  const comparison = page.getByRole("region", { name: "Pay comparison" });
  await expect(page.getByRole("heading", { name: "Side-by-side comparison" })).toBeFocused();
  await expect(page.locator(".pay-comparison__summary")).toContainText("Overtime hours");
  await expect(page.locator(".pay-comparison__summary")).toContainText("Overtime pay");
  await expect(page.locator(".pay-comparison__summary")).not.toContainText("Hourly rate");
  await expect(comparison.getByRole("row", { name: /^Hourly rate/ }).getByRole("cell")).toHaveText(["$11.50", "$11.50"]);
  await expect(comparison.getByRole("row", { name: /^Overtime pay/ }).getByRole("cell")).toHaveText(["$0.00", "$86.25 (different)"]);
  await expectAccessible(page);
  await page.getByRole("button", { name: "Close comparison" }).click();
});

test("admin filters and groups the report by charge account and downloads what they see", async ({ page }) => {
  await signInToDashboard(page, ACCOUNTS.ADMIN);
  await openAdminTool(page, "Generate Payroll and Pay Periods");
  const report = page.locator(".payroll-report");
  await expect(report.locator(".talon-report-status")).toContainText("report lines loaded");
  const table = report.getByRole("region", { name: "Payroll report table" });

  // Liz's hours are split between her CSC job and MATH tutoring.
  await report.getByLabel("Group rows by").selectOption("line");
  await expect(table.getByRole("row", { name: /Elizabeth \(Liz\) Park/ })).toHaveCount(2);

  await report.getByLabel("Charge account").selectOption({ label: "G21047 – NSF REU Research Grant" });
  await expect(table.getByRole("rowheader")).toHaveText(["Sophia (Sophie) Wells", "Total"]);
  await expect(table.getByRole("row", { name: /Sophia/ })).toContainText("Computer Science");

  await report.getByLabel("Charge account").selectOption("");
  await report.getByLabel("Group rows by").selectOption("account");
  for (const code of ["110245", "120310", "G21047"]) await expect(table.getByRole("row", { name: new RegExp(code) })).toHaveCount(1);

  // Sorting by total pay puts the largest first when descending.
  await report.getByLabel("Group rows by").selectOption("person");
  await table.getByRole("button", { name: /Total pay/ }).click();
  await table.getByRole("button", { name: /Total pay/ }).click();
  await expect(table.getByRole("columnheader", { name: /Total pay/ })).toHaveAttribute("aria-sort", "descending");
  await expect(table.getByRole("rowheader").first()).toHaveText("Sophia (Sophie) Wells");

  const [download] = await Promise.all([page.waitForEvent("download"), report.getByRole("button", { name: "Download CSV" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^payroll-report-\d+\.csv$/);
  const csv = readFileSync(await download.path(), "utf8");
  expect(csv.split("\r\n")[0]).toContain("Regular hours,Regular pay,Overtime hours,Overtime pay,Total hours,Total pay");
  expect(csv).toContain("Sophia (Sophie) Wells,Computer Science,G21047");
  await expectAccessible(page);
});

test("monthly reports include hours worked", async ({ page }) => {
  await signInToDashboard(page, ACCOUNTS.ADMIN);
  await openAdminTool(page, "Generate Payroll and Pay Periods");
  const report = page.locator(".payroll-report");
  const monthly = report.getByLabel("Pay period").locator("option", { hasText: /^Monthly/ }).filter({ hasNotText: "No payroll data" });
  await report.getByLabel("Pay period").selectOption(await monthly.first().getAttribute("value") ?? "");
  const row = report.getByRole("row", { name: /William Turner/ });
  await expect(row).toBeVisible();
  // William is a monthly-paid hourly student: hours are reported, not just dollars.
  await expect(row.getByRole("cell").nth(4)).not.toHaveText("0.00");
  await expectAccessible(page);
});

for (const role of ["ADMIN", "SUPERVISOR"] as const) {
  test(`${role.toLowerCase()} can select pay periods before stubs are generated`, async ({ page }) => {
    await page.goto("/login");
    await expectAccessible(page);
    await signInToDashboard(page, ACCOUNTS[role]);
    if (role === "ADMIN") await openAdminTool(page, "Generate Payroll and Pay Periods");
    else await openSupervisorTool(page, "Payroll Reports");

    const report = page.locator(".payroll-report");
    const reportFilter = report.getByLabel("Pay period");
    for (const range of ["9/28/2026 – 10/11/2026", "11/9/2026 – 11/22/2026", "11/23/2026 – 12/6/2026"]) {
      await expect(reportFilter.getByRole("option", { name: new RegExp(range) })).toHaveCount(1);
    }
    const calendarOnly = reportFilter.getByRole("option", { name: /9\/28\/2026 – 10\/11\/2026.*Timecard dates only/ });
    await reportFilter.selectOption((await calendarOnly.getAttribute("value"))!);
    await expect(report.getByText("No payroll report has been generated for this timecard period.")).toBeVisible();
    await expect(report.getByRole("button", { name: "Download CSV" })).toBeDisabled();
    const emptyPeriods = [];
    for (const cycle of ["Bi-weekly", "Monthly"]) {
      const option = reportFilter.getByRole("option", { name: new RegExp(`^${cycle}.*No payroll data`) }).first();
      const id = (await option.getAttribute("value"))!;
      emptyPeriods.push(id);
      await reportFilter.selectOption(id);
      await expect(report.getByText("No payroll data is available for this pay period.")).toBeVisible();
      await expect(report.getByRole("button", { name: "Download CSV" })).toBeDisabled();
    }
    await expectAccessible(page);

    if (role === "ADMIN") {
      await page.getByRole("button", { name: "Back to Overview", exact: true }).click();
      await openAdminTool(page, "Time Entry Approvals");
    } else {
      await page.getByRole("button", { name: "Back to Overview", exact: true }).click();
      await openSupervisorTool(page, "Student Pay Stubs");
    }
    const reviews = page.locator(".team-pay-stubs");
    for (const id of emptyPeriods) {
      await reviews.getByLabel("Pay period").selectOption(id);
      await expect(reviews.getByText("No student pay stubs match the selected filters.")).toBeVisible();
    }
    await expectAccessible(page);
  });
}

test("supervisor's report only includes their students and can be marked reviewed", async ({ page }) => {
  await signInToDashboard(page, PEOPLE.SECOND_SUPERVISOR);
  await openSupervisorTool(page, "Payroll Reports");
  const report = page.locator(".payroll-report");
  await expect(report.getByRole("rowheader", { name: "Robert Hale" })).toBeVisible();
  await expect(report.getByRole("rowheader", { name: "Elizabeth (Liz) Park" })).toBeVisible();
  await expect(report.getByRole("rowheader", { name: "Chris Student" })).toHaveCount(0);

  const todos = page.getByRole("region", { name: "To-Dos" });
  const request = report.getByRole("button", { name: "Mark report reviewed" });
  if (await request.isVisible()) {
    // The to-do stays until the report is actually marked reviewed.
    await expect(todos.getByRole("button", { name: /Review the payroll report/ })).toBeVisible();
    await todos.getByRole("button", { name: /Review the payroll report/ }).click();
    await expect(page.locator("#report-heading")).toBeFocused();
    await page.reload();
    await expect(todos.getByRole("button", { name: /Review the payroll report/ })).toBeVisible();
    await todos.getByRole("button", { name: /Review the payroll report/ }).click();
    await page.locator(".payroll-report").getByRole("button", { name: "Mark report reviewed" }).click();
    await expect(todos.getByRole("button", { name: /Review the payroll report/ })).toHaveCount(0);
  }
  await expectAccessible(page);
});
