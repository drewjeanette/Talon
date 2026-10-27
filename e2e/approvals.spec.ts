import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, PEOPLE, SEED_PASSWORD, expectAccessible, openAdminTool, openSupervisorTool, signInToDashboard, switchUser } from "./helpers";

for (const role of ["ADMIN", "SUPERVISOR"] as const) {
  test(`${role.toLowerCase()} sees Job Title without charge account editing in time entry approvals`, async ({ page }) => {
    await signInToDashboard(page, ACCOUNTS[role]);
    if (role === "ADMIN") await openAdminTool(page, "Time Entry Approvals");
    else await openSupervisorTool(page, "Time Entry Approvals");
    const entries = page.getByRole("region", { name: "Time entries awaiting approval", exact: true });
    await expect(entries.getByRole("columnheader", { name: "Job Title", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Change charge account/ })).toHaveCount(0);
    await expect(entries.getByRole("button", { name: /^Approve time entry/ }).first()).toBeVisible();
    await expect(entries.getByRole("button", { name: /^Deny time entry/ }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Reviewed time changes", exact: true })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Reviewed time change requests", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Missed punches & correction requests", exact: true })).toBeVisible();
    await expectAccessible(page);
  });
}

/** A missed shift Liz asks to add, unique to this test run. */
async function requestMissedShift(page: Page, reason: string, daysAgo: number, student: string = PEOPLE.LIZ) {
  await signInToDashboard(page, student);
  const day = new Date(Date.now() - daysAgo * 86_400_000);
  const local = (hour: number) => `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00`;
  const form = page.locator(".student-time-tools");
  await form.getByRole("button", { name: "Fix a missed clock-in or clock-out" }).click();
  await expect(form.locator(".correction-recipient")).toHaveText(student === PEOPLE.LIZ
    ? "Sent to: Marcus Reyes, Sabrina Supervisor. Any assigned supervisor can approve."
    : "Sent to: Sabrina Supervisor");
  await form.getByLabel("Shift to correct").selectOption("new");
  // Liz has two jobs, so a missed shift says which one.
  if (student === PEOPLE.LIZ) await form.getByLabel("Job", { exact: true }).selectOption({ label: "Math Tutor" });
  await form.getByLabel("Correct clock-in").fill(local(9));
  await form.getByLabel("Correct clock-out").fill(local(11));
  // Every date/time picker explains the same commit step.
  await expect(form.getByText("Saved when you select “Send for approval”.")).toHaveCount(2);
  await form.getByLabel("Reason for the correction").fill(reason);
  await form.getByRole("button", { name: "Send for approval" }).click();
  await expect(form.getByRole("status")).toHaveText(student === PEOPLE.LIZ
    ? "Correction sent to Marcus Reyes, Sabrina Supervisor for approval. Any assigned supervisor can approve it."
    : "Correction sent to Sabrina Supervisor for approval.");
  // The pending request names the currently assigned approvers.
  const request = form.getByRole("listitem").filter({ hasText: reason });
  await expect(request).toContainText("Missed shift: PENDING");
  await expect(request.locator(".correction-history__waiting")).toContainText(/· pending \d+ (minute|hour|day)s?/);
  await expect(request).toContainText(student === PEOPLE.LIZ
    ? "Waiting for approval from Marcus Reyes, Sabrina Supervisor. Any assigned supervisor can approve."
    : "Waiting for Sabrina Supervisor’s approval.");
  await expectAccessible(page);
}

test("a student sees their assigned supervisor before submitting and while awaiting approval", async ({ page }, testInfo) => {
  const reason = `Named supervisor (${testInfo.project.name})`;
  await requestMissedShift(page, reason, 5, ACCOUNTS.STUDENT);
  await switchUser(page, ACCOUNTS.SUPERVISOR);
  await openSupervisorTool(page, "Time Entry Approvals");
  const row = page.getByRole("row").filter({ hasText: reason });
  await expect(row).toContainText("Chris Student");
  await row.getByRole("button", { name: "Approve time correction for Chris Student", exact: true }).click();
  await expect(page.locator(".approval-queue > .status-message")).toHaveText("Correction request approved.");
  await expect(page.getByRole("region", { name: "Reviewed time change requests", exact: true })).toHaveCount(0);
  await page.reload();
  await openSupervisorTool(page, "Time Entry Approvals");
  await expect(page.getByRole("heading", { name: "Reviewed time changes", exact: true })).toHaveCount(0);
  await expectAccessible(page);
  await switchUser(page, ACCOUNTS.STUDENT);
  const request = page.locator(".student-time-tools").getByRole("listitem").filter({ hasText: reason });
  await expect(request).toContainText("Missed shift: APPROVED");
  await expect(request).toContainText("Reviewed by Sabrina");
  await expect(request).not.toContainText("Waiting for");
  await page.waitForLoadState("networkidle");
  await expectAccessible(page);
  await switchUser(page, PEOPLE.SECOND_SUPERVISOR);
  // The staff history API remains scoped even though it is no longer a supervisor dashboard section.
  const login = await page.request.post("/api/auth/login", { data: { email: PEOPLE.SECOND_SUPERVISOR, password: SEED_PASSWORD } });
  const { accessToken } = await login.json();
  const history = await page.request.get("/api/timeclock/correction-requests/reviewed", { headers: { Authorization: `Bearer ${accessToken}` } });
  expect(history.ok()).toBeTruthy();
  const otherStudentsHistory = await history.json() as { reason: string }[];
  expect(otherStudentsHistory.some((review) => review.reason === reason)).toBe(false);
  await expect(page.getByRole("region", { name: "Reviewed time change requests", exact: true }).getByText(reason, { exact: true })).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  await expectAccessible(page);
});

for (const unavailable of [false, true]) {
  test(`student correction form explains ${unavailable ? "a supervisor lookup failure" : "a missing supervisor assignment"}`, async ({ page }) => {
    await page.route("**/api/users/me/approvers", (route) => route.fulfill({
      status: unavailable ? 503 : 200,
      json: unavailable ? { error: "Unavailable" } : { supervisors: [] },
    }));
    if (!unavailable) await page.route("**/api/timeclock/correction-requests/mine", async (route) => {
      const response = await route.fetch();
      const requests = await response.json() as { waitingOn: string[] }[];
      await route.fulfill({ response, json: requests.map((request) => ({ ...request, waitingOn: [] })) });
    });
    await signInToDashboard(page, unavailable ? ACCOUNTS.STUDENT : PEOPLE.SOPHIE);
    const tools = page.locator(".student-time-tools");
    await tools.getByRole("button", { name: "Fix a missed clock-in or clock-out" }).click();
    await expect(tools.locator(".correction-recipient")).toHaveText(unavailable
      ? "Could not load your assigned supervisor. Your request will still be available to your assigned supervisors and admins."
      : "No supervisor assigned. An admin can review your request.");
    await expect(tools.getByRole("button", { name: "Send for approval", exact: true })).toBeEnabled();
    if (!unavailable) await expect(tools.getByRole("listitem").filter({ hasText: "Missed shift: PENDING" }).first())
      .toContainText("Waiting for an admin’s approval. No supervisor is assigned.");
    await expectAccessible(page);
  });
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
  await openSupervisorTool(supervisor, "Time Entry Approvals");

  const row = supervisor.getByRole("row").filter({ hasText: reason });
  await row.getByRole("button", { name: /Approve time correction for Elizabeth \(Liz\) Park/ }).click();
  await expect(supervisor.locator(".approval-queue > .status-message")).toHaveText("Correction request approved.");
  await expect(supervisor.getByRole("region", { name: "Time correction requests awaiting approval", exact: true }).getByRole("row").filter({ hasText: reason })).toHaveCount(0);
  await expect(supervisor.getByRole("heading", { name: "Reviewed time changes", exact: true })).toHaveCount(0);
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
  await expect(row).toHaveCount(0);
  await expect(admin.locator(".talon-action-attribution")).toContainText("Approved by Renee");
  await admin.reload();
  await openAdminTool(admin, "Time Entry Approvals");
  await expect(admin.getByRole("heading", { name: "Reviewed time changes", exact: true })).toHaveCount(0);
  await expect(admin.getByRole("region", { name: "Reviewed time change requests", exact: true })).toHaveCount(0);
  await expect(admin.getByRole("region", { name: "Time correction requests awaiting approval", exact: true }).getByRole("row").filter({ hasText: reason })).toHaveCount(0);
  await expectAccessible(admin);
  await admin.locator(".approval-queue").screenshot({ path: testInfo.outputPath("pending-approvals.png") });

  await switchUser(page, PEOPLE.LIZ);
  const approvedRequest = page.locator(".student-time-tools").getByRole("listitem").filter({ hasText: reason });
  await expect(approvedRequest).toContainText("Missed shift: APPROVED");
  await expect(approvedRequest).toContainText("Reviewed by Renee");
  await expectAccessible(page);
});

test("students cannot access the staff time-change review history", async ({ request }) => {
  const login = await request.post("/api/auth/login", { data: { email: ACCOUNTS.STUDENT, password: SEED_PASSWORD } });
  expect(login.ok()).toBeTruthy();
  const { accessToken } = await login.json();
  const history = await request.get("/api/timeclock/correction-requests/reviewed", { headers: { Authorization: `Bearer ${accessToken}` } });
  expect(history.status()).toBe(403);
});

test("a supervisor cannot see another supervisor's students", async ({ page }) => {
  await signInToDashboard(page, ACCOUNTS.SUPERVISOR);
  await openSupervisorTool(page, "Time Entry Approvals");
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
