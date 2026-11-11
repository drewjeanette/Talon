import { test, expect } from "@playwright/test";
import { ACCOUNTS, expectAccessible, signInToDashboard } from "./helpers";

for (const role of ["SUPERVISOR", "STUDENT"] as const) {
  test(`${role.toLowerCase()} can replace the female silhouette with an uploaded photo`, async ({ page }) => {
    if (role === "STUDENT") {
      // Brooke's production account is absent from the isolated demo seed.
      await page.route("**/api/auth/login", async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        await route.fulfill({ response, json: {
          ...body, user: { ...body.user, email: "bmstockmas42@tntech.edu", firstName: "Brooke", lastName: "Stockmaster" },
        } });
      });
    }
    await page.route("**/api/auth/profile-photo", async (route) => {
      if (route.request().method() === "POST") await route.fulfill({ json: { saved: true } });
      else await route.fulfill({ status: 204 });
    });
    await page.goto("/login");
    await expectAccessible(page);
    await signInToDashboard(page, ACCOUNTS[role]);
    const photo = page.locator(".dashboard__photo-image");
    const silhouette = photo.locator("svg path[fill='#6f647f']");
    await expect(silhouette).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("button", { name: "Add profile photo" }).click();
    const viewer = page.getByRole("dialog", { name: "Your profile photo" });
    await expect(viewer.getByRole("button", { name: "Add photo" })).toBeEnabled();
    await page.getByLabel("Choose a profile photo").setInputFiles("client/src/assets/ttu-logo.png");
    await expect(photo.locator("img")).toBeVisible();
    await expect(silhouette).toHaveCount(0);
    await expect(viewer.getByRole("button", { name: "Replace photo" })).toBeEnabled();
    await expectAccessible(page);
    await viewer.getByRole("button", { name: "Remove photo" }).click();
    await expect(silhouette).toBeVisible();
  });
}
