import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { ACCOUNTS, PEOPLE, expectAccessible, latestEmailLink, openAdminTool, signInToDashboard, switchUser } from "./helpers";

test("admin's own pay stubs are a plain list with a PDF download", async ({ page }) => {
  await signInToDashboard(page, ACCOUNTS.ADMIN);
  await openAdminTool(page, "My Pay Stubs");
  const mine = page.locator(".pay-stubs");
  await expect(mine.getByRole("row")).not.toHaveCount(1);
  await expect(mine.getByRole("button", { name: /Approve|Reject/ })).toHaveCount(0);
  const [download] = await Promise.all([page.waitForEvent("download"), mine.getByRole("button", { name: /Download PDF/ }).first().click()]);
  expect(download.suggestedFilename()).toMatch(/^paystub-.*\.pdf$/);
  expect(readFileSync(await download.path()).subarray(0, 5).toString()).toBe("%PDF-");
  await expectAccessible(page);

  // The review list is for students only: the admin's own stub is never in it.
  await page.getByRole("button", { name: "Back to Overview" }).click();
  await openAdminTool(page, "Time Entry Approvals");
  await page.getByLabel("Show reviewed stubs").check();
  const review = page.getByRole("region", { name: "Student pay stub review" });
  await expect(review.getByRole("rowheader", { name: /Sophia \(Sophie\) Wells/ }).first()).toBeVisible();
  await expect(review.getByRole("rowheader", { name: /Renee Admin/ })).toHaveCount(0);
  await expect(review.getByRole("rowheader", { name: /Sabrina Supervisor/ })).toHaveCount(0);
});

test("a student downloads their pay stub as a PDF", async ({ page }) => {
  await signInToDashboard(page, PEOPLE.SOPHIE);
  const mine = page.locator(".pay-stubs");
  await expect(mine.getByRole("cell", { name: "$592.25" })).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), mine.getByRole("button", { name: /Download PDF/ }).first().click()]);
  expect(readFileSync(await download.path()).subarray(0, 5).toString()).toBe("%PDF-");
  await expectAccessible(page);
});

test("admin approves several student pay stubs at once", async ({ page }) => {
  await signInToDashboard(page, ACCOUNTS.ADMIN);
  await openAdminTool(page, "Time Entry Approvals");
  const section = page.locator(".team-pay-stubs");
  const pending = section.getByRole("checkbox", { name: /^Select pay stub for/ });
  await expect(pending.first()).toBeVisible();
  const before = await pending.count();
  expect(before).toBeGreaterThanOrEqual(2);
  await pending.nth(0).check();
  await pending.nth(1).check();
  await section.getByRole("button", { name: "Approve selected (2)" }).click();
  await expect(section.locator(":scope > .status-message")).toHaveText("Approved 2 pay stubs.");
  await expect(pending).toHaveCount(before - 2);
  await expectAccessible(page);
});

test("a question flagged on a pay stub goes to the student's supervisor until answered", async ({ page }, testInfo) => {
  const question = `Was a tutoring shift missed? (${testInfo.project.name})`;
  await signInToDashboard(page, ACCOUNTS.ADMIN);
  await openAdminTool(page, "Time Entry Approvals");
  const section = page.locator(".team-pay-stubs");
  await section.getByLabel("Show reviewed stubs").check();
  await section.getByRole("button", { name: "Flag a question on Robert Hale's pay stub" }).click();
  await section.getByLabel("Question about this pay stub").fill(question);
  await section.getByRole("button", { name: "Send question" }).click();
  await expect(section.locator(":scope > .status-message")).toHaveText("Question sent about Robert Hale's pay stub.");
  await expect(section.getByRole("rowheader", { name: /Robert Hale/ })).toContainText(question);
  await expectAccessible(page);

  await switchUser(page, PEOPLE.SECOND_SUPERVISOR);
  const todos = page.getByRole("region", { name: "To-Dos" });
  await expect(todos.getByRole("button", { name: /Answer pay stub questions/ })).toBeVisible();
  const stubs = page.locator(".team-pay-stubs");
  await stubs.getByLabel("Show reviewed stubs").check();
  await stubs.getByRole("button", { name: "Answer question on Robert Hale's pay stub" }).click();
  await stubs.getByLabel("Answer", { exact: true }).fill("Checked the timecard; nothing was missed.");
  await stubs.getByRole("button", { name: "Mark answered" }).click();
  await expect(stubs.locator(":scope > .status-message")).toHaveText("Marked the question on Robert Hale's pay stub as answered.");
  await expect(stubs.getByRole("rowheader", { name: /Robert Hale/ })).toContainText("Answered");
  await expectAccessible(page);
});

test("admin changes a student's hourly rate from the approvals area", async ({ page }) => {
  await signInToDashboard(page, ACCOUNTS.ADMIN);
  await openAdminTool(page, "Time Entry Approvals");
  const rate = page.getByRole("spinbutton", { name: /^Katherine Diaz/ });
  const row = page.locator(".pay-rate-row").filter({ has: rate });
  await rate.fill("11.25");
  await row.getByRole("button", { name: "Save rate" }).click();
  await expect(page.locator(".pay-rate-manager > .status-message")).toContainText("Katherine Diaz's hourly rate is now $11.25.");
  await expectAccessible(page);
  // Put it back so other tests see the seeded rate.
  await rate.fill("11.00");
  await row.getByRole("button", { name: "Save rate" }).click();
  await expect(page.locator(".pay-rate-manager > .status-message")).toContainText("is now $11.00.");

  // Rates are no longer edited in User Management.
  await page.getByRole("button", { name: "Back to Overview" }).click();
  await openAdminTool(page, "User Management");
  await expect(page.getByRole("spinbutton", { name: /^Katherine Diaz/ })).toHaveCount(0);
});

test("admin emails each supervisor one checklist of students waiting on them", async ({ page }) => {
  await signInToDashboard(page, ACCOUNTS.ADMIN);
  await openAdminTool(page, "Time Entry Approvals");
  await page.getByRole("button", { name: "Email supervisors now" }).click();
  await expect(page.locator(".reminder-sender").getByRole("status")).toHaveText(/Sent \d+ summary emails?, one per supervisor/);
  // One email per supervisor, listing every waiting student as a checklist line.
  const link = await latestEmailLink(ACCOUNTS.SUPERVISOR, "/");
  expect(link).toContain("http");
  const log = readFileSync(`${__dirname}/.server.log`, "utf8");
  const email = log.split("[email] To: ").filter((block) => block.startsWith(ACCOUNTS.SUPERVISOR) && block.includes("waiting on your approval")).at(-1) ?? "";
  expect(email).toMatch(/\[ \] Chris Student - \d+ shifts?/);
  await expectAccessible(page);
});
