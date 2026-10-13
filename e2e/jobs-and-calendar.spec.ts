import { test, expect } from "@playwright/test";
import { ACCOUNTS, PEOPLE, expectAccessible, openAdminTool, pickPerson, signInToDashboard } from "./helpers";

// Liz (elizabeth.park@) has two jobs in the seed: CS Lab Assistant (110245) and
// Math Tutor (120310). Everyone else has one.

test("a student with two jobs picks the job when clocking in and can fix a wrong pick", async ({ page }) => {
  await signInToDashboard(page, PEOPLE.LIZ);
  const clock = page.locator(".clock-widget");
  await expect(clock.getByRole("group", { name: "Which job are you clocking in for?" })).toBeVisible();

  // Clocking in without choosing asks for a job instead of guessing.
  await clock.getByRole("button", { name: "Clock In" }).click();
  await expect(clock.getByRole("status")).toHaveText("Choose which job you are clocking in for.");

  await clock.getByRole("radio", { name: /CS Lab Assistant/ }).check();
  await clock.getByRole("button", { name: "Clock In" }).click();
  await expect(clock.getByRole("status")).toHaveText("Clocked in for CS Lab Assistant.");
  await expect(clock).toContainText("Clocked in for CS Lab Assistant since");

  // Wrong job: the button opens a card to move the shift.
  await clock.getByRole("button", { name: "Clocked in for the wrong job?" }).click();
  const card = clock.getByRole("group", { name: "Move this shift to another job" });
  await expect(card).toBeVisible();
  await expectAccessible(page);
  await card.getByRole("radio", { name: /Math Tutor/ }).check();
  await card.getByRole("button", { name: "Move shift" }).click();
  await expect(clock.getByRole("status")).toHaveText("Shift moved to Math Tutor.");
  await expect(clock).toContainText("Clocked in for Math Tutor since");
  await expect(card).toHaveCount(0);

  await clock.getByRole("button", { name: "Clock Out" }).click();
  await expect(clock.getByRole("status")).toHaveText("Clocked out.");
});

test("a student with one job just clocks in, and the missed-punch form opens as a card", async ({ page }) => {
  await signInToDashboard(page, ACCOUNTS.STUDENT);
  const clock = page.locator(".clock-widget");
  await expect(clock.getByRole("group", { name: "Which job are you clocking in for?" })).toHaveCount(0);
  await expect(clock.getByRole("button", { name: "Clocked in for the wrong job?" })).toHaveCount(0);

  const tools = page.locator(".student-time-tools");
  await expect(tools.getByLabel("Reason for the correction")).toHaveCount(0);
  await tools.getByRole("button", { name: "Fix a missed clock-in or clock-out" }).click();
  await expect(tools.getByLabel("Shift to correct")).toBeFocused();
  await expect(tools.getByLabel("Job", { exact: true })).toHaveCount(0);
  await expectAccessible(page);
  await tools.getByRole("button", { name: "Cancel" }).click();
  await expect(tools.getByLabel("Reason for the correction")).toHaveCount(0);
  await expect(tools.getByRole("button", { name: "Fix a missed clock-in or clock-out" })).toBeVisible();
});

test("a supervisor moves a pending shift to a different charge account", async ({ page }) => {
  await signInToDashboard(page, ACCOUNTS.SUPERVISOR);
  const queue = page.locator(".approval-queue");
  const row = queue.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Chris Student" }) }).first();
  await row.getByRole("button", { name: /Change charge account/ }).click();
  const target = await row.getByLabel("Charge this shift to").locator("option", { hasText: "G21047" }).count() ? "G21047" : "110245";
  await row.getByLabel("Charge this shift to").selectOption({ label: target === "G21047" ? "G21047 – NSF REU Research Grant" : "110245 – Computer Science Student Workers" });
  await expectAccessible(page);
  await row.getByRole("button", { name: "Move shift" }).click();
  await expect(queue.locator(":scope > .status-message")).toHaveText(`Shift for Chris Student moved to ${target}.`);
});

test("admin gives a student a second job and ends it", async ({ page }, testInfo) => {
  const title = `Library Aide ${testInfo.project.name}`;
  await signInToDashboard(page, ACCOUNTS.ADMIN);
  await openAdminTool(page, "User Management");
  await pickPerson(page, "Find people", "katherine", "Katherine Diaz");
  await page.getByRole("button", { name: "Edit Katherine Diaz" }).click();
  const jobs = page.getByRole("group", { name: "Jobs" });
  await jobs.getByLabel("New job title").fill(title);
  await jobs.getByLabel("New job charge account").selectOption({ label: "120310 - Mathematics Tutoring Center" });
  await jobs.getByRole("button", { name: "Add job" }).click();
  await expect(page.locator(".user-management > .status-message")).toHaveText(`Added ${title} for Katherine Diaz.`);
  // The edit row stays open with the new job listed.
  await expect(jobs).toContainText(title);
  await expectAccessible(page);
  await page.getByRole("group", { name: "Jobs" }).getByRole("button", { name: `End job ${title}` }).click();
  await expect(page.locator(".user-management > .status-message")).toHaveText(`Ended ${title} for Katherine Diaz. Past shifts keep it.`);
});

test("admin changes payroll reminder times in Settings", async ({ page }) => {
  await signInToDashboard(page, ACCOUNTS.ADMIN);
  await page.goto("/settings?tab=payroll-calendar");
  await expect(page.getByRole("heading", { name: "Payroll Calendar" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Next scheduled emails" })).toBeVisible();
  await expectAccessible(page);

  const save = page.getByRole("button", { name: "Save payroll calendar" });
  const biweekly = page.getByRole("group", { name: "Bi-weekly (period closes Sunday)" });
  await expect(save).toBeDisabled();

  // An escalation after the deadline is rejected with a clear message.
  await biweekly.getByLabel("Deadline-day escalation at").fill("13:00");
  await save.click();
  await expect(page.getByRole("alert")).toContainText("escalation before approvals are due");

  await biweekly.getByLabel("Deadline-day escalation at").fill("10:30");
  await save.click();
  await expect(page.locator(".settings-card__status")).toHaveText("Payroll calendar saved.");
  await page.reload();
  await expect(page.getByRole("group", { name: "Bi-weekly (period closes Sunday)" }).getByLabel("Deadline-day escalation at")).toHaveValue("10:30");

  // Put the default back for other tests.
  await page.getByRole("group", { name: "Bi-weekly (period closes Sunday)" }).getByLabel("Deadline-day escalation at").fill("10:00");
  await page.getByRole("button", { name: "Save payroll calendar" }).click();
  await expect(page.locator(".settings-card__status")).toHaveText("Payroll calendar saved.");
});

test("only admins see the payroll calendar", async ({ page }) => {
  await signInToDashboard(page, ACCOUNTS.SUPERVISOR);
  await page.goto("/settings");
  await expect(page.getByRole("tab", { name: "Notifications" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Payroll Calendar" })).toHaveCount(0);
});
