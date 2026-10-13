import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { ACCOUNTS, PEOPLE, expectAccessible, openAdminTool, pickPerson, signInToDashboard } from "./helpers";

// The seed's previous bi-weekly period is generated: Chris and Sophie both earn
// $11.50/hour, but Sophie worked 5 hours of overtime and is charged to the
// NSF grant (G21047) even though her home department is Computer Science.

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

test("supervisor's report only includes their students and can be marked reviewed", async ({ page }) => {
  await signInToDashboard(page, PEOPLE.SECOND_SUPERVISOR);
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
    await page.locator(".payroll-report").getByRole("button", { name: "Mark report reviewed" }).click();
    await expect(todos.getByRole("button", { name: /Review the payroll report/ })).toHaveCount(0);
  }
  await expectAccessible(page);
});
