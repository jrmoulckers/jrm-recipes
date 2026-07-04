import { expect, test } from "@playwright/test";

test("home and recipes pages load", async ({ page }) => {
  const home = await page.goto("/");
  expect(home?.ok()).toBe(true);
  await expect(page.getByText("Heirloom", { exact: true }).first()).toBeVisible();

  const recipes = await page.goto("/recipes");
  expect(recipes?.ok()).toBe(true);
  await expect(
    page.getByRole("heading", { name: /your cookbook/i }),
  ).toBeVisible();
});
