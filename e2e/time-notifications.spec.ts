import { test, expect } from "@playwright/test";
import { ACCOUNTS, PEOPLE, SEED_PASSWORD, expectAccessible, openAdminTool, openSupervisorTool, signInToDashboard } from "./helpers";

test.setTimeout(60_000);

for (const role of ["SUPERVISOR", "ADMIN"] as const) {
  for (const kind of ["entry", "correction"] as const) {
    for (const decision of ["approved", "denied"] as const) {
      test(`${role.toLowerCase()} ${decision} ${kind} notifies only its student`, async ({ page, browser, request }, testInfo) => {
        const login = await request.post("/api/auth/login", { data: { email: ACCOUNTS.STUDENT, password: SEED_PASSWORD } });
        const { accessToken } = await login.json();
        const headers = { Authorization: `Bearer ${accessToken}` };
        // Keep each accessibility scan focused on this flow rather than every
        // update created by earlier tests in the shared seeded database.
        const existing = await request.get("/api/notifications", { headers });
        for (const item of await existing.json() as { id: number; type: string }[]) {
          if (/^TIME_(ENTRY|CORRECTION)_(APPROVED|REJECTED)$/.test(item.type)) {
            expect((await request.patch(`/api/notifications/${item.id}`, { headers, data: { dismissed: true } })).ok()).toBeTruthy();
          }
        }
        const reason = `${role} ${kind} ${decision} ${testInfo.project.name}`;
        let id: number;
        if (kind === "entry") {
          const response = await request.post("/api/timeclock/clock-in", { headers, data: {} });
          expect(response.ok()).toBeTruthy();
          id = (await response.json()).id;
          expect((await request.post("/api/timeclock/clock-out", { headers })).ok()).toBeTruthy();
        } else {
          const entries = await request.get("/api/timeclock/my-entries", { headers });
          const approvedEntry = (await entries.json() as { id: number; status: string }[]).find((entry) => entry.status === "APPROVED");
          const response = await request.post("/api/timeclock/correction-requests", { headers, data: {
            ...(role === "ADMIN" ? { timeEntryId: approvedEntry!.id } : {}),
            clockIn: new Date(Date.now() - 8 * 86_400_000).toISOString(),
            clockOut: new Date(Date.now() - 8 * 86_400_000 + 3_600_000).toISOString(),
            reason,
          } });
          expect(response.ok()).toBeTruthy();
          id = (await response.json()).id;
        }

        // Keep the student signed in while another browser session reviews.
        await signInToDashboard(page, ACCOUNTS.STUDENT);
        await expectAccessible(page);
        const reviewerContext = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
        const reviewer = await reviewerContext.newPage();
        try {
          await signInToDashboard(reviewer, ACCOUNTS[role]);
          if (role === "ADMIN") await openAdminTool(reviewer, "Time Entry Approvals");
          else await openSupervisorTool(reviewer, "Time Entry Approvals");
          const row = kind === "entry"
            ? reviewer.getByRole("region", { name: "Time entries awaiting approval", exact: true }).getByRole("row").filter({ hasText: "Chris Student" }).last()
            : reviewer.getByRole("row").filter({ hasText: reason });
          if (decision === "denied") {
            await row.getByRole("button", { name: `Deny time ${kind} for Chris Student`, exact: true }).click();
            await expect(row.getByLabel("Reason for denial")).toBeFocused();
            await row.getByRole("button", { name: "Confirm denial" }).click();
            await expect(reviewer.locator(".approval-queue > .status-message")).toContainText("Enter a reason");
            await expectAccessible(reviewer);
            await row.getByLabel("Reason for denial").fill(reason);
            await row.getByRole("button", { name: "Confirm denial" }).click();
          } else {
            await row.getByRole("button", { name: `Approve time ${kind} for Chris Student`, exact: true }).click();
          }
          await expect(reviewer.locator(".approval-queue > .status-message")).toContainText(`${decision}.`);
          await expectAccessible(reviewer);

          await page.evaluate(() => window.dispatchEvent(new Event("focus")));
          const title = `Time ${kind} ${decision}`;
          const updates = page.getByRole("region", { name: "Time request updates" });
          const notice = updates.getByRole("listitem").filter({ has: page.getByRole("heading", { name: title, exact: true }) }).first();
          await expect(notice).toContainText(`Reviewed by ${role === "ADMIN" ? "Renee" : "Sabrina"}`);
          if (decision === "denied") await expect(notice).toContainText(`Reason: ${reason}`);
          await expectAccessible(page);
          if (role === "SUPERVISOR" && kind === "correction" && decision === "denied") {
            await updates.screenshot({ path: testInfo.outputPath("student-time-denied.png") });
          }

          // Re-review is rejected and does not create duplicate notifications.
          const staffLogin = await request.post("/api/auth/login", { data: { email: ACCOUNTS[role], password: SEED_PASSWORD } });
          const staffHeaders = { Authorization: `Bearer ${(await staffLogin.json()).accessToken}` };
          const path = kind === "entry" ? `/api/timeclock/${id}/decision` : `/api/timeclock/correction-requests/${id}/decision`;
          expect((await request.patch(path, { headers: staffHeaders, data: { status: "APPROVED" } })).status()).toBe(409);
          const otherLogin = await request.post("/api/auth/login", { data: { email: PEOPLE.SOPHIE, password: SEED_PASSWORD } });
          const otherHeaders = { Authorization: `Bearer ${(await otherLogin.json()).accessToken}` };
          const otherNotices = await request.get("/api/notifications", { headers: otherHeaders });
          expect(await otherNotices.json()).toEqual([]);

          const notices = await request.get("/api/notifications", { headers });
          const items = await notices.json() as { id: number; title: string; body: string }[];
          expect(items.filter((item) => item.title === title)).toHaveLength(1);
          const newest = items[0];
          expect(newest.title).toBe(title);
          expect((await request.patch(`/api/notifications/${newest.id}`, { headers: otherHeaders, data: { dismissed: true } })).status()).toBe(404);
          await notice.getByRole("button", { name: `Dismiss ${title.toLowerCase()} update`, exact: true }).click();
          await expect(page.getByRole("status").filter({ hasText: "Time request update dismissed." })).toBeVisible();
          await page.reload();
          const remaining = await request.get("/api/notifications", { headers });
          expect((await remaining.json() as { id: number }[]).some((item) => item.id === newest.id)).toBe(false);
          await expectAccessible(page);
        } finally {
          await reviewerContext.close();
        }
      });
    }
  }
}
