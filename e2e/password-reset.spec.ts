import { test, expect } from "@playwright/test";
import { ACCOUNTS, expectAccessible, latestEmailLink, signIn, SEED_PASSWORD } from "./helpers";

test("login page links to forgot password and is accessible", async ({ page }) => {
  await page.goto("/login");
  await expectAccessible(page);
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(page.getByRole("heading", { name: "Forgot Password" })).toBeVisible();
  await expectAccessible(page);
});

test("forgot password gives the same answer for unknown emails", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("TN Tech email").fill("nobody-here@tntech.edu");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If that email belongs to a Talon account");
});

test("an invalid reset link is rejected", async ({ page }) => {
  await page.goto("/reset-password?token=not-a-real-token");
  await expect(page).toHaveURL(/\/reset-password$/); // token removed from the address bar
  await expectAccessible(page);
  await page.getByLabel("New password", { exact: true }).fill("a-brand-new-password");
  await page.getByLabel("Confirm new password").fill("a-brand-new-password");
  await page.getByRole("button", { name: "Reset password" }).click();
  await expect(page.getByRole("alert")).toContainText("invalid or has expired");
});

test("a user can reset a forgotten password from the emailed link", async ({ page }, testInfo) => {
  const email = `e2e.reset.${testInfo.project.name}@tntech.edu`;
  const newPassword = `reset-${testInfo.project.name}-${Date.now()}`;

  await page.goto("/forgot-password");
  await page.getByLabel("TN Tech email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toBeVisible();

  const link = await latestEmailLink(email, "/reset-password");
  await page.goto(link);
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm new password").fill("does-not-match-123");
  await page.getByRole("button", { name: "Reset password" }).click();
  await expect(page.getByRole("alert")).toHaveText("Passwords do not match.");

  await page.getByLabel("Confirm new password").fill(newPassword);
  await page.getByRole("button", { name: "Reset password" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("status")).toContainText("Your password was reset");

  // The link only works once.
  await page.goto(link);
  await page.getByLabel("New password", { exact: true }).fill(`${newPassword}-again`);
  await page.getByLabel("Confirm new password").fill(`${newPassword}-again`);
  await page.getByRole("button", { name: "Reset password" }).click();
  await expect(page.getByRole("alert")).toContainText("invalid or has expired");

  // Old password fails, new one works.
  await signIn(page, email, SEED_PASSWORD);
  await expect(page.getByRole("alert")).toHaveText("Invalid email or password.");
  await signIn(page, email, newPassword);
  await expect(page).toHaveURL(/\/$/);
});

test("signed-in users are sent from forgot password to account settings", async ({ page }) => {
  await signIn(page, ACCOUNTS.STUDENT);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/forgot-password");
  await expect(page).toHaveURL(/\/settings\?tab=account$/);
});
