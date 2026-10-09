import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, PEOPLE, expectAccessible, openAdminTool, signInToDashboard, switchUser } from "./helpers";

/** A missed shift Liz asks to add, unique to this test run. */
async function requestMissedShift(page: Page, reason: string, daysAgo: number) {
  await signInToDashboard(page, PEOPLE.LIZ);
  const day = new Date(Date.now() - daysAgo * 86_400_000);
  const local = (hour: number) => `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00`;
  const form = page.locator(".student-time-tools");
  await form.getByLabel("Shift to correct").selectOption("new");
  await form.getByLabel("Correct clock-in").fill(local(9));
  await form.getByLabel("Correct clock-out").fill(local(11));
  // Every date/time picker explains the same commit step.
  await expect(form.getByText("Saved when you select “Send for approval”.")).toHaveCount(2);
  await form.getByLabel("Reason for the correction").fill(reason);
  await form.getByRole("button", { name: "Send for approval" }).click();
  await expect(form.getByRole("status")).toHaveText("Correction sent for approval. Any of your supervisors can approve it.");
  // Liz has two supervisors; the request shows who it waits on and for how long.
  const request = form.getByRole("listitem").filter({ hasText: reason });
  await expect(request).toContainText("Waiting on Marcus Reyes or Sabrina Supervisor · pending");
  await expectAccessible(page);
}

async function correctionsCount(page: Page) {
  const item = page.getByRole("button", { name: /Review time corrections/ });
  return Number(await item.locator(".work-queue__count").textContent());
}

test("either of a student's supervisors can approve a correction, and the to-do stays until it is done", async ({ page }, testInfo) => {
  const reason = `Lab ran late (${testInfo.project.name} co-supervisor)`;
  await requestMissedShift(page, reason, 3);

  const supervisor = page;
  await switchUser(supervisor, PEOPLE.SECOND_SUPERVISOR);
  const todos = supervisor.getByRole("region", { name: "To-Dos" });
  const before = await correctionsCount(supervisor);
  expect(before).toBeGreaterThan(0);

  // Opening the to-do does not clear it.
  await todos.getByRole("button", { name: /Review time corrections/ }).click();
  await expect(supervisor.locator("#approvals-heading")).toBeFocused();
  await supervisor.reload();
  expect(await correctionsCount(supervisor)).toBe(before);

  const row = supervisor.getByRole("row").filter({ hasText: reason });
  await row.getByRole("button", { name: /Approve time correction for Elizabeth \(Liz\) Park/ }).click();
  await expect(supervisor.locator(".approval-queue > .status-message")).toHaveText("Correction request approved.");
  await expect(supervisor.getByRole("row").filter({ hasText: reason })).toHaveCount(0);
  // Completing the work updates the to-do without a reload.
  if (before === 1) await expect(todos.getByRole("button", { name: /Review time corrections/ })).toHaveCount(0);
  else await expect(todos.getByRole("button", { name: /Review time corrections/ }).locator(".work-queue__count")).toHaveText(String(before - 1));
  await expectAccessible(supervisor);
});

test("any admin can approve a correction", async ({ page }, testInfo) => {
  const reason = `Forgot to clock in (${testInfo.project.name} admin)`;
  await requestMissedShift(page, reason, 4);

  const admin = page;
  await switchUser(admin, ACCOUNTS.ADMIN);
  await openAdminTool(admin, "Time Entry Approvals");
  const row = admin.getByRole("row").filter({ hasText: reason });
  await expect(row).toContainText("Elizabeth (Liz) Park");
  await row.getByRole("button", { name: /Approve time correction/ }).click();
  await expect(admin.locator(".approval-queue > .status-message")).toHaveText("Correction request approved.");
  await expectAccessible(admin);

  await switchUser(page, PEOPLE.LIZ);
  await expect(page.locator(".student-time-tools").getByRole("listitem").filter({ hasText: reason })).toContainText("Missed shift: APPROVED");
});

test("a supervisor cannot see another supervisor's students", async ({ page }) => {
  await signInToDashboard(page, ACCOUNTS.SUPERVISOR);
  const queue = page.locator(".approval-queue");
  await expect(queue.getByRole("rowheader", { name: "Chris Student" }).first()).toBeVisible();
  await expect(queue.getByRole("rowheader", { name: "Robert Hale" })).toHaveCount(0);
  await expect(queue.getByRole("rowheader", { name: "Christopher Lane" })).toHaveCount(0);
  await expectAccessible(page);
});

test("a student with rejected time sees a to-do that stays after opening it", async ({ page }) => {
  await signInToDashboard(page, PEOPLE.KATHERINE);
  const todo = page.getByRole("region", { name: "To-Dos" }).getByRole("button", { name: /Fix rejected time/ });
  await expect(todo).toBeVisible();
  await todo.click();
  await expect(page.locator("#time-help-heading")).toBeFocused();
  await page.reload();
  await expect(page.getByRole("region", { name: "To-Dos" }).getByRole("button", { name: /Fix rejected time/ })).toBeVisible();
  await expectAccessible(page);
});
