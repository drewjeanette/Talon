import { test, expect } from "@playwright/test";
import { ACCOUNTS, PEOPLE, SEED_PASSWORD, expectAccessible, openAdminTool, openSupervisorTool, signInToDashboard } from "./helpers";

for (const role of ["SUPERVISOR", "ADMIN"] as const) {
  for (const trigger of ["opening", "focus", "poll"] as const) {
    test(`${role.toLowerCase()} refreshes pending shifts and corrections on ${trigger}`, async ({ page, request }, testInfo) => {
      if (trigger === "poll") await page.clock.install();
      await signInToDashboard(page, ACCOUNTS[role]);
      const openApprovals = () => role === "ADMIN"
        ? openAdminTool(page, "Time Entry Approvals")
        : openSupervisorTool(page, "Time Entry Approvals");
      await openApprovals();
      const entries = page.getByRole("region", { name: "Time entries awaiting approval", exact: true });
      const approveEntries = entries.getByRole("button", { name: "Approve time entry for Chris Student", exact: true });
      await expect(approveEntries.first()).toBeVisible();
      await expectAccessible(page);
      const before = await approveEntries.count();

      // Submit from another session after the mounted approval list has loaded.
      const login = await request.post("/api/auth/login", { data: { email: ACCOUNTS.STUDENT, password: SEED_PASSWORD } });
      expect(login.ok()).toBeTruthy();
      const { accessToken } = await login.json();
      const headers = { Authorization: `Bearer ${accessToken}` };
      const clockIn = await request.post("/api/timeclock/clock-in", { headers, data: {} });
      expect(clockIn.ok()).toBeTruthy();
      const { id: entryId } = await clockIn.json();
      expect((await request.post("/api/timeclock/clock-out", { headers })).ok()).toBeTruthy();
      const reason = `Refresh ${role} ${trigger} ${testInfo.project.name}`;
      const correction = await request.post("/api/timeclock/correction-requests", {
        headers, data: {
          clockIn: new Date(Date.now() - 6 * 86_400_000).toISOString(),
          clockOut: new Date(Date.now() - 6 * 86_400_000 + 3_600_000).toISOString(),
          reason,
        },
      });
      expect(correction.ok()).toBeTruthy();

      // An unrelated supervisor must still neither see nor approve the shift.
      const otherLogin = await request.post("/api/auth/login", { data: { email: PEOPLE.SECOND_SUPERVISOR, password: SEED_PASSWORD } });
      const otherHeaders = { Authorization: `Bearer ${(await otherLogin.json()).accessToken}` };
      const otherPending = await request.get("/api/timeclock/pending", { headers: otherHeaders });
      expect((await otherPending.json() as { id: number }[]).some((entry) => entry.id === entryId)).toBe(false);
      expect((await request.patch(`/api/timeclock/${entryId}/decision`, { headers: otherHeaders, data: { status: "APPROVED" } })).status()).toBe(403);

      if (trigger === "opening") {
        await page.getByRole("button", { name: "Back to Overview", exact: true }).click();
        await openApprovals();
      } else if (trigger === "focus") {
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      } else {
        await page.clock.fastForward(60_000);
      }
      await expect(approveEntries).toHaveCount(before + 1);
      const correctionRow = page.getByRole("row").filter({ hasText: reason });
      await expect(correctionRow).toContainText("Chris Student");
      await correctionRow.getByRole("button", { name: "Approve time correction for Chris Student", exact: true }).click();
      await expect(correctionRow).toHaveCount(0);
      await expectAccessible(page);
    });
  }
}
