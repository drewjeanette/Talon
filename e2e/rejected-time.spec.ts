import { test, expect, type APIRequestContext } from "@playwright/test";
import { ACCOUNTS, PEOPLE, SEED_PASSWORD, expectAccessible, mockAccountTheme, openStudentCategory, signInToDashboard } from "./helpers";

async function headersFor(request: APIRequestContext, email: string) {
  const login = await request.post("/api/auth/login", { data: { email, password: SEED_PASSWORD } });
  expect(login.ok()).toBeTruthy();
  return { Authorization: `Bearer ${(await login.json()).accessToken}` };
}

for (const theme of ["light", "dark"] as const) {
  test(`rejected time is actionable in its category and clears only after resolution in ${theme} mode`, async ({ page, request }, testInfo) => {
    test.setTimeout(120_000);
    const email = `e2e.rejection.${theme}.${testInfo.project.name}@tntech.edu`;
    const headers = await headersFor(request, email);
    const staff = await headersFor(request, theme === "light" ? ACCOUNTS.SUPERVISOR : ACCOUNTS.ADMIN);
    const other = await headersFor(request, PEOPLE.SOPHIE);
    const ids: number[] = [];
    for (let i = 0; i < 2; i++) {
      const started = await request.post("/api/timeclock/clock-in", { headers, data: {} });
      expect(started.ok()).toBeTruthy();
      const { id } = await started.json();
      ids.push(id);
      expect((await request.post("/api/timeclock/clock-out", { headers })).ok()).toBeTruthy();
      // Only the owning student may resolve a rejected shift, never pending time.
      expect((await request.patch(`/api/timeclock/my-entries/${id}/acknowledge-rejection`, { headers, data: { acknowledged: true } })).status()).toBe(409);
      expect((await request.patch(`/api/timeclock/${id}/decision`, { headers: staff, data: { status: "REJECTED", rejectionReason: `Test shift ${i + 1} was not worked.` } })).ok()).toBeTruthy();
    }
    const acknowledge = `/api/timeclock/my-entries/${ids[0]}/acknowledge-rejection`;
    expect((await request.patch(acknowledge, { data: { acknowledged: true } })).status()).toBe(401);
    expect((await request.patch(acknowledge, { headers: other, data: { acknowledged: true } })).status()).toBe(404);
    expect((await request.patch(acknowledge, { headers: staff, data: { acknowledged: true } })).status()).toBe(403);
    expect((await request.patch(acknowledge, { headers, data: { acknowledged: false } })).status()).toBe(400);
    const original = await (await request.get("/api/timeclock/my-entries", { headers })).json();

    await mockAccountTheme(page, theme);
    if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/login");
    await expectAccessible(page);
    await signInToDashboard(page, email);
    const category = page.locator(".student-category--corrections");
    const todos = page.getByRole("region", { name: "To-Dos", exact: true });
    await expect(category).not.toHaveAttribute("open", "");
    await todos.getByRole("button", { name: /Fix rejected time/ }).click();
    await expect(category).toHaveAttribute("open", "");
    await expect(page.locator("#time-help-heading")).toBeFocused();
    await expect(todos.locator(".work-queue__count")).toHaveText("2");
    const rejected = page.getByRole("region", { name: "Rejected time needing action", exact: true });
    await expect(rejected.getByRole("listitem")).toHaveCount(2);
    await expectAccessible(page);

    // The direct action selects and prefills this rejected shift.
    await rejected.getByRole("button", { name: "Correct this shift", exact: true }).first().click();
    const form = page.locator(".student-time-tools__card");
    const correctedId = Number(await form.getByLabel("Shift to correct").inputValue());
    expect(ids).toContain(correctedId);
    const local = (value: number) => {
      const date = new Date(value);
      return new Date(value - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    };
    const clockIn = Date.now() - 3_600_000;
    await form.getByLabel("Correct clock-in", { exact: true }).fill(local(clockIn));
    await form.getByLabel("Correct clock-out", { exact: true }).fill(local(clockIn + 1_800_000));
    await form.getByLabel("Reason for the correction").fill("I worked half an hour and need the correct times reviewed.");
    await form.getByRole("button", { name: "Send for approval", exact: true }).click();
    await expect(todos.locator(".work-queue__count")).toHaveText("1");
    await expect(rejected.getByRole("listitem")).toHaveCount(1);
    await expect(category.locator(".correction-history")).toContainText("PENDING");
    await expectAccessible(page);

    // A denied correction needs action again instead of hiding it permanently.
    const corrections = await (await request.get("/api/timeclock/correction-requests/mine", { headers })).json();
    expect((await request.patch(`/api/timeclock/correction-requests/${corrections[0].id}/decision`, { headers: staff, data: { status: "REJECTED", reviewerReason: "Check the times again." } })).ok()).toBeTruthy();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(todos.locator(".work-queue__count")).toHaveText("2");
    await expect(rejected.getByRole("listitem")).toHaveCount(2);

    await expect(category.locator(".correction-history")).toContainText("Shift correction: REJECTED");
    await expect(category.locator(".correction-history")).toContainText("Check the times again.");

    // A failed save keeps the work visible and lets the student retry.
    await page.route("**/acknowledge-rejection", route => route.fulfill({ status: 503, json: { error: "Try again later." } }));
    await rejected.getByRole("button", { name: "No correction needed", exact: true }).first().click();
    await expect(category.getByRole("status")).toContainText("Try again later.");
    await expect(rejected.getByRole("listitem")).toHaveCount(2);
    await page.unroute("**/acknowledge-rejection");
    await rejected.getByRole("button", { name: "No correction needed", exact: true }).first().click();
    await expect(todos.locator(".work-queue__count")).toHaveText("1");
    await expect(rejected.getByRole("listitem")).toHaveCount(1);
    await rejected.getByRole("button", { name: "No correction needed", exact: true }).click();
    await expect(todos).toHaveCount(0);
    await expect(rejected).toContainText("No rejected time needs action.");
    await expect(page.locator("#time-help-heading")).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expectAccessible(page);
    await category.screenshot({ path: testInfo.outputPath(`resolved-rejected-time-${theme}.png`) });
    await page.reload();
    await openStudentCategory(page, "Correction Requests");
    await expect(todos).toHaveCount(0);
    await expect(rejected).toContainText("No rejected time needs action.");
    await expectAccessible(page);

    const saved = await (await request.get("/api/timeclock/my-entries", { headers })).json();
    for (const entry of saved) {
      const before = original.find((item: { id: number }) => item.id === entry.id);
      expect(entry.status).toBe("REJECTED");
      expect(entry.clockIn).toBe(before.clockIn);
      expect(entry.clockOut).toBe(before.clockOut);
      expect(entry.rejectionAcknowledgedAt).toBeTruthy();
      expect(entry.needsCorrection).toBe(false);
    }
  });
}
