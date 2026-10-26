import { test, expect } from "@playwright/test";
import { ACCOUNTS, SEED_PASSWORD, expectAccessible, openAdminTool, pickPerson, signInToDashboard } from "./helpers";

test("admin changes account access inside Edit and can reactivate the user", async ({ page, request }, testInfo) => {
  test.setTimeout(60_000);
  const login = await request.post("/api/auth/login", { data: { email: ACCOUNTS.ADMIN, password: SEED_PASSWORD } });
  expect(login.ok()).toBeTruthy();
  const { accessToken } = await login.json();
  const headers = { Authorization: `Bearer ${accessToken}` };
  const email = `e2e.account-actions.${testInfo.project.name}@tntech.edu`;
  const name = `Account Actions${testInfo.project.name}`;
  const created = await request.post("/api/users", {
    headers,
    data: { email, firstName: "Account", lastName: `Actions${testInfo.project.name}`, role: "STUDENT", payType: "BIWEEKLY", hourlyRate: 12 },
  });
  expect(created.status()).toBe(201);
  const { id, tempPassword } = await created.json();

  await signInToDashboard(page, ACCOUNTS.ADMIN);
  await openAdminTool(page, "User Management");
  await pickPerson(page, "Find people", name, name);
  const row = page.getByRole("region", { name: "All users", exact: true }).getByRole("row").filter({ has: page.getByRole("rowheader", { name, exact: true }) });
  await expect(row.getByRole("button")).toHaveCount(1);
  await row.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
  const actions = row.getByRole("group", { name: "Account access", exact: true });
  await expect(actions.getByRole("button", { name: "Deactivate", exact: true })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Reactivate", exact: true })).toHaveCount(0);
  await expectAccessible(page);
  const deactivated = page.waitForResponse((response) => response.url().endsWith(`/api/users/${id}/deactivate`) && response.request().method() === "PATCH");
  await actions.getByRole("button", { name: "Deactivate", exact: true }).click();
  expect((await deactivated).status()).toBe(204);
  await expect(page.locator(".user-management > .status-message")).toHaveText(`Deactivated ${name}.`);
  await expect(actions.getByRole("button", { name: "Reactivate", exact: true })).toBeVisible();
  const blockedLogin = await request.post("/api/auth/login", { data: { email, password: tempPassword } });
  expect(blockedLogin.status()).toBe(401);
  const reactivated = page.waitForResponse((response) => response.url().endsWith(`/api/users/${id}/reactivate`) && response.request().method() === "PATCH");
  await actions.getByRole("button", { name: "Reactivate", exact: true }).click();
  expect((await reactivated).status()).toBe(204);
  await expect(page.locator(".user-management > .status-message")).toHaveText(`Reactivated ${name}.`);
  await expect(actions.getByRole("button", { name: "Deactivate", exact: true })).toBeVisible();
  const restoredLogin = await request.post("/api/auth/login", { data: { email, password: tempPassword } });
  expect(restoredLogin.status()).toBe(200);
  await row.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(row.getByRole("button")).toHaveCount(1);
  await expect(row.getByRole("cell", { name: "Yes", exact: true })).toBeVisible();
  await expectAccessible(page);

  await row.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
  await actions.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(actions.getByText(/This cannot be undone/)).toBeVisible();
  await expectAccessible(page);
  await actions.screenshot({ path: testInfo.outputPath("account-actions.png") });
  await actions.getByRole("button", { name: "Cancel removal", exact: true }).click();
  await expect(actions.getByRole("button", { name: "Permanently remove", exact: true })).toBeHidden();
  await actions.getByRole("button", { name: "Remove", exact: true }).click();
  const removed = page.waitForResponse((response) => response.url().endsWith(`/api/users/${id}`) && response.request().method() === "DELETE");
  await actions.getByRole("button", { name: "Permanently remove", exact: true }).click();
  expect((await removed).status()).toBe(204);
  await expect(page.locator(".user-management > .status-message")).toHaveText(`Removed ${name}.`);
  await expect(row).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Find people", exact: true })).toBeFocused();
  expect((await request.post("/api/auth/login", { data: { email, password: tempPassword } })).status()).toBe(401);
  const remaining = await request.get("/api/users", { headers });
  expect((await remaining.json() as { id: number }[]).some((user) => user.id === id)).toBe(false);

  await pickPerson(page, "Find people", "Chris Student", "Chris Student");
  const historicalRow = page.getByRole("region", { name: "All users", exact: true }).getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Chris Student", exact: true }) });
  await historicalRow.getByRole("button", { name: "Edit Chris Student", exact: true }).click();
  await historicalRow.getByRole("button", { name: "Remove", exact: true }).click();
  await historicalRow.getByRole("button", { name: "Permanently remove", exact: true }).click();
  await expect(page.locator(".user-management > .status-message")).toHaveText("This account has payroll or administrative history and cannot be removed. Deactivate it instead.");
  await expect(historicalRow).toBeVisible();
  await expectAccessible(page);

  for (const action of ["deactivate", "reactivate"]) {
    const missing = await request.patch(`/api/users/2147483647/${action}`, { headers });
    expect(missing.status()).toBe(404);
    const invalid = await request.patch(`/api/users/invalid/${action}`, { headers });
    expect(invalid.status()).toBe(400);
  }
  const self = await login.json();
  const selfDeactivate = await request.patch(`/api/users/${self.user.id}/deactivate`, { headers });
  expect(selfDeactivate.status()).toBe(409);
  const selfRemove = await request.delete(`/api/users/${self.user.id}`, { headers });
  expect(selfRemove.status()).toBe(409);
});

for (const role of ["STUDENT", "SUPERVISOR"] as const) {
  test(`${role.toLowerCase()} cannot change account access`, async ({ request }) => {
    const login = await request.post("/api/auth/login", { data: { email: ACCOUNTS[role], password: SEED_PASSWORD } });
    expect(login.ok()).toBeTruthy();
    const { accessToken } = await login.json();
    for (const action of ["deactivate", "reactivate"]) {
      const response = await request.patch(`/api/users/1/${action}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      expect(response.status()).toBe(403);
    }
    const removal = await request.delete("/api/users/1", { headers: { Authorization: `Bearer ${accessToken}` } });
    expect(removal.status()).toBe(403);
  });
}
