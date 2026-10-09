import { test, expect } from "@playwright/test";
import { ACCOUNTS, expectAccessible, signIn, type Role } from "./helpers";

const EXPECTED_TYPES: Record<Role, string[]> = {
  STUDENT: ["Time that needs fixing"],
  SUPERVISOR: ["Approval reminders", "Deadline escalations"],
  ADMIN: ["Payroll deadline summary", "Rejected pay stubs"],
};

for (const role of Object.keys(ACCOUNTS) as Role[]) {
  test.describe(`${role.toLowerCase()} settings`, () => {
    test.beforeEach(async ({ page }) => {
      await signIn(page, ACCOUNTS[role]);
      await expect(page).toHaveURL(/\/$/);
      await page.getByRole("banner").getByRole("link", { name: "Settings" }).click();
      await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
    });

    test("shows only this role's email notifications and saves changes", async ({ page }) => {
      await expect(page.getByRole("banner").getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
      // Dashboard stays in the top-center nav and leads back to the dashboard.
      await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Dashboard" })).toBeVisible();
      const switches = page.getByRole("switch");
      await expect(switches).toHaveCount(EXPECTED_TYPES[role].length);
      for (const label of EXPECTED_TYPES[role]) await expect(page.getByRole("switch", { name: label })).toBeVisible();
      await expect(page.getByText("Always on")).toBeVisible();
      await expectAccessible(page);

      const save = page.getByRole("button", { name: "Save changes" });
      const first = page.getByRole("switch", { name: EXPECTED_TYPES[role][0] });
      const before = await first.isChecked();
      await expect(save).toBeDisabled();

      await first.click();
      await expect(save).toBeEnabled();
      await save.click();
      await expect(page.getByRole("status").filter({ hasText: "saved" })).toBeVisible();

      await page.reload();
      await expect(page.getByRole("switch", { name: EXPECTED_TYPES[role][0] })).toBeChecked({ checked: !before });

      // Put it back so the shared test database stays predictable.
      await page.getByRole("switch", { name: EXPECTED_TYPES[role][0] }).click();
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(page.getByRole("status").filter({ hasText: "saved" })).toBeVisible();
    });

    test("account tab shows details and is keyboard reachable", async ({ page }) => {
      await page.getByRole("tab", { name: "Notifications" }).focus();
      await page.keyboard.press("ArrowDown");
      await expect(page.getByRole("tab", { name: "Account" })).toBeFocused();
      await expect(page.getByRole("tab", { name: "Account" })).toHaveAttribute("aria-selected", "true");
      await expect(page).toHaveURL(/tab=account/);

      await expect(page.getByText(ACCOUNTS[role])).toBeVisible();
      await expect(page.getByRole("heading", { name: "Change Password" })).toBeVisible();
      await expectAccessible(page);

      await page.getByLabel("Current password").fill("wrong-current-password");
      await page.getByLabel("New password", { exact: true }).fill("another-new-password");
      await page.getByLabel("Confirm new password").fill("different-new-password");
      await page.getByRole("button", { name: "Change password" }).click();
      await expect(page.getByRole("alert")).toHaveText("New passwords do not match.");
    });
  });
}
