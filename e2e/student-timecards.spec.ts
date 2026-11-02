import { test, expect } from "@playwright/test";
import { ACCOUNTS, expectAccessible, mockAccountTheme, openStudentCategory, SEED_PASSWORD, signInToDashboard } from "./helpers";

// Payroll follows Cookeville's calendar even when the student's browser is abroad.
test.use({ timezoneId: "Asia/Tokyo" });

const periods = [
  { startDate: "2026-11-30T00:00:00Z", endDate: "2026-12-13T23:59:59Z" },
  { startDate: "2026-11-02T00:00:00Z", endDate: "2026-11-15T23:59:59Z" },
  { startDate: "2026-10-19T00:00:00Z", endDate: "2026-11-01T23:59:59Z" },
  { startDate: "2026-10-05T00:00:00Z", endDate: "2026-10-18T23:59:59Z" },
];
const shift = (id: number, clockIn: string, reviewer: string) => ({
  id, clockIn, clockOut: new Date(Date.parse(clockIn) + 3_600_000).toISOString(),
  status: "APPROVED", reviewedBy: reviewer,
});
const entries = [
  shift(1, "2026-11-15T18:00:00Z", "Current reviewer"),
  shift(2, "2026-11-02T06:00:00Z", "First minute reviewer"),
  shift(3, "2026-11-02T05:59:00Z", "Previous reviewer"),
  shift(4, "2026-10-19T05:00:00Z", "October start reviewer"),
  shift(5, "2026-10-19T04:59:00Z", "Older reviewer"),
];

for (const theme of ["light", "dark"] as const) {
  test(`student timecards separate periods and automatically roll into history in ${theme} mode`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await mockAccountTheme(page, theme);
    await page.clock.install({ time: new Date("2026-11-16T05:59:00Z") });
    await page.route("**/api/payroll/timecard-periods", route => route.fulfill({ json: periods }));
    await page.route("**/api/timeclock/my-entries", route => route.fulfill({ json: entries }));
    // History must work before payroll has generated any stubs.
    await page.route("**/api/payroll/my-stubs", route => route.fulfill({ json: [] }));
    await page.goto("/login");
    await expectAccessible(page);
    await signInToDashboard(page, ACCOUNTS.STUDENT);
    await openStudentCategory(page, "Past Timecards");
    const current = page.getByRole("region", { name: "Current Timecard", exact: true });
    const past = page.getByRole("region", { name: "Past Timecards", exact: true });
    await expect(current).toContainText("11/2/2026 – 11/15/2026 · 2.00 hrs");
    await expect(current.locator("tbody tr")).toHaveCount(2);
    await expect(current.locator("tbody tr").first().locator("td").first()).toHaveText("11/15/2026, 12:00:00 PM");
    await expect(current).not.toContainText("Previous reviewer");
    await expect(past.locator("details")).toHaveCount(2);
    const previous = past.locator("details").filter({ hasText: "10/19/2026 – 11/1/2026" });
    await previous.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(previous).toHaveAttribute("open", "");
    await expect(previous.locator("tbody tr")).toHaveCount(2);
    await expect(previous).toContainText("Previous reviewer");
    await expect(previous).toContainText("October start reviewer");
    await expectAccessible(page);

    // No reload, payroll generation, or new configured period is needed at midnight Central.
    await page.clock.fastForward(60_000);
    await expect(current).toContainText("11/16/2026 – 11/29/2026 · 0.00 hrs");
    await expect(current).toContainText("No time entries were recorded for this period.");
    await expect(past.locator("details")).toHaveCount(3);
    const completed = past.locator("details").first();
    await expect(completed.locator("summary")).toContainText("11/2/2026 – 11/15/2026");
    await completed.locator("summary").click();
    await expect(completed.locator("tbody tr")).toHaveCount(2);
    await expect(completed).toContainText("Current reviewer");
    await expect(completed).toContainText("First minute reviewer");
    if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 320, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expectAccessible(page);
    await past.screenshot({ path: testInfo.outputPath(`past-timecards-${theme}.png`) });
    await page.reload();
    await openStudentCategory(page, "Past Timecards");
    await expect(current).toContainText("11/16/2026 – 11/29/2026");
    await expect(past.locator("details")).toHaveCount(3);
    await expectAccessible(page);
  });
}

test("student timecards report a calendar failure and allow retry", async ({ page }) => {
  await page.route("**/api/payroll/timecard-periods", route => route.fulfill({ status: 500, json: { message: "Unavailable" } }));
  await page.goto("/login");
  await expectAccessible(page);
  await signInToDashboard(page, ACCOUNTS.STUDENT);
  const current = page.getByRole("region", { name: "Current Timecard", exact: true });
  await expect(current.getByRole("status")).toContainText("Could not load the payroll calendar");
  await expectAccessible(page);
  await page.route("**/api/payroll/timecard-periods", route => route.fulfill({ json: periods }));
  await current.getByRole("button", { name: "Retry timecards" }).click();
  await expect(current.locator("table")).toBeVisible();
  await expectAccessible(page);
});

test("the student calendar endpoint exposes only biweekly dates and requires sign-in", async ({ request }) => {
  expect((await request.get("/api/payroll/timecard-periods")).status()).toBe(401);
  const login = await request.post("/api/auth/login", { data: { email: ACCOUNTS.STUDENT, password: SEED_PASSWORD } });
  expect(login.ok()).toBe(true);
  const { accessToken } = await login.json();
  const calendar = await request.get("/api/payroll/timecard-periods", { headers: { Authorization: `Bearer ${accessToken}` } });
  expect(calendar.ok()).toBe(true);
  const result = await calendar.json();
  expect(result.length).toBeGreaterThan(0);
  for (const period of result) {
    expect(Object.keys(period).sort()).toEqual(["endDate", "startDate"]);
    expect(Date.parse(period.endDate) - Date.parse(period.startDate)).toBeLessThan(14 * 86_400_000);
  }
});
