import { test, expect } from "@playwright/test";
import { ACCOUNTS, PEOPLE, expectAccessible, openAdminTool, pickPerson, signInToDashboard, suggestions } from "./helpers";

test.describe("person search behaves the same everywhere", () => {
  test("admin finds people by preferred name, nickname, partial name, and typo", async ({ page }) => {
    await signInToDashboard(page, ACCOUNTS.ADMIN);
    await openAdminTool(page, "User Management");
    const search = page.getByRole("combobox", { name: "Find people" });

    const cases: [string, string][] = [
      ["Sophie Wells", "Sophia (Sophie) Wells"],
      ["bob", "Robert Hale"],
      ["dick", "Richard Moss"],
      ["Wells, Sophie", "Sophia (Sophie) Wells"],
      ["Turnr", "William Turner"],
      ["liz", "Elizabeth (Liz) Park"],
    ];
    for (const [query, name] of cases) {
      await search.fill(query);
      await expect(search).toHaveAttribute("aria-expanded", "true");
      await expect(suggestions(page, "Find people").first(), `"${query}" should suggest ${name}`).toContainText(name);
    }

    // Keyboard: arrow to the suggestion and press Enter to pick it.
    await search.fill("chris");
    await expect(suggestions(page, "Find people").first()).toContainText("Chris Student");
    await search.press("ArrowDown");
    await search.press("ArrowUp");
    await search.press("Enter");
    await expect(page.getByRole("list", { name: "Selected for Find people" })).toContainText("Chris Student");
    const table = page.getByRole("region", { name: "All users" });
    await expect(table.getByRole("rowheader")).toHaveText(["Chris Student"]);
    await expectAccessible(page);

    await page.getByRole("button", { name: "Remove Chris Student" }).click();
    await expect(table.getByRole("rowheader").filter({ hasText: "Robert Hale" })).toBeVisible();
  });
});

test.describe("supervisors only see their own students; admins see everyone", () => {
  test("first supervisor sees Computer Science students, including the shared one", async ({ page }) => {
    await signInToDashboard(page, ACCOUNTS.SUPERVISOR);
    const rate = (name: string) => page.getByRole("spinbutton", { name: new RegExp(`^${name.replace(/[()]/g, "\\$&")}`) });
    await expect(rate("Chris Student")).toBeVisible();
    await expect(rate("Elizabeth (Liz) Park")).toBeVisible();
    await expect(rate("Robert Hale")).toHaveCount(0);
    const report = page.locator(".payroll-report");
    await expect(report.getByRole("rowheader", { name: "Chris Student" })).toBeVisible();
    await expect(report.getByRole("rowheader", { name: "Robert Hale" })).toHaveCount(0);
    await expectAccessible(page);
  });

  test("second supervisor sees Mathematics students and the shared student", async ({ page }) => {
    await signInToDashboard(page, PEOPLE.SECOND_SUPERVISOR);
    const rate = (name: string) => page.getByRole("spinbutton", { name: new RegExp(`^${name.replace(/[()]/g, "\\$&")}`) });
    await expect(rate("Robert Hale")).toBeVisible();
    await expect(rate("Elizabeth (Liz) Park")).toBeVisible();
    await expect(rate("Chris Student")).toHaveCount(0);
    await expectAccessible(page);
  });

  test("admin sees students from every department", async ({ page }) => {
    await signInToDashboard(page, ACCOUNTS.ADMIN);
    await openAdminTool(page, "Time Entry Approvals");
    await expect(page.getByRole("spinbutton", { name: /^Chris Student/ })).toBeVisible();
    await expect(page.getByRole("spinbutton", { name: /^Robert Hale/ })).toBeVisible();
    await expectAccessible(page);
  });
});

test("admin adds a charge account and a student with a preferred name and two supervisors", async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  const code = `E2E-${project.toUpperCase()}`;
  await signInToDashboard(page, ACCOUNTS.ADMIN);

  await openAdminTool(page, "Departments & Colleges");
  await page.getByLabel("Index code").fill(code);
  await page.getByLabel("Account name").fill(`Test grant (${project})`);
  await page.getByRole("button", { name: "Add charge account" }).click();
  await expect(page.locator(".charge-accounts").getByRole("status")).toHaveText(`Charge account ${code} added.`);
  await expect(page.getByRole("rowheader", { name: code })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("button", { name: "Back to Overview" }).click();
  await openAdminTool(page, "User Management");
  const form = page.locator(".user-management__form");
  await form.getByLabel("Email").fill(`e2e.nickname.${project}@tntech.edu`);
  await form.getByLabel("First name").fill("Bartholomew");
  await form.getByLabel("Preferred name (optional)").fill("Bart");
  await form.getByLabel("Last name").fill(`Tester${project}`);
  await form.getByLabel("Charge account (index)").selectOption({ label: `${code} - Test grant (${project})` });
  await form.getByLabel("Starting hourly rate ($)").fill("12.75");
  await pickPerson(page, "Supervisors", "sabrina", "Sabrina Supervisor", form);
  await pickPerson(page, "Supervisors", "marcus", "Marcus Reyes", form);
  await form.getByRole("button", { name: "Create user" }).click();
  await expect(page.locator(".user-management > .status-message")).toContainText(`Created e2e.nickname.${project}@tntech.edu`);

  await pickPerson(page, "Find people", `bart tester${project}`, `Bartholomew (Bart) Tester${project}`);
  const row = page.getByRole("row", { name: /Bartholomew \(Bart\)/ });
  await expect(row).toContainText(code);
  await expect(row).toContainText("Marcus Reyes, Sabrina Supervisor");
  await expectAccessible(page);
});
