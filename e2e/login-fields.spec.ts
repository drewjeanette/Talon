import { test, expect } from "@playwright/test";
import { ACCOUNTS, SEED_PASSWORD, expectAccessible } from "./helpers";

test("sign-in fields have no blue outline and retain a neutral keyboard focus cue", async ({ page }, testInfo) => {
  await page.goto("/login");
  await expectAccessible(page);
  const email = page.getByLabel("Email", { exact: true });
  const password = page.getByLabel("Password", { exact: true });
  await email.focus();
  await email.fill(ACCOUNTS.STUDENT);
  await expect(email).toHaveCSS("outline-style", "none");
  await expect(email).toHaveCSS("box-shadow", "rgb(98, 92, 107) 0px -3px 0px 0px inset");
  await expectAccessible(page);
  await email.press("Tab");
  await expect(password).toBeFocused();
  await expect(password).toHaveCSS("outline-style", "none");
  await expect(password).toHaveCSS("box-shadow", "rgb(98, 92, 107) 0px -3px 0px 0px inset");
  await expectAccessible(page);
  await page.locator(".login-card").screenshot({ path: testInfo.outputPath("plain-login-fields.png") });
  await password.fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Good");
  await expectAccessible(page);
});
