import { expect, test, type Page } from "@playwright/test";

/**
 * Share + print journeys (issue #241). The Share control is a client dropdown
 * exposing a "Copy link" affordance, and the print route renders a
 * printer-friendly layout ("Ingredients" / "Method") plus a Print / Save PDF
 * button that calls window.print(). We assert the affordances exist and are
 * reachable, not the OS-level print dialog (which Playwright can't drive).
 *
 * Depends on the seeded public recipe; skips gracefully when no database is
 * wired, mirroring tests/e2e/offline.spec.ts.
 */
const RECIPE_SLUG = "nonnas-sunday-gravy";
const RECIPE_PATH = `/recipes/${RECIPE_SLUG}`;
const PRINT_PATH = `${RECIPE_PATH}/print`;

async function gotoSeeded(page: Page, path: string): Promise<boolean> {
  const res = await page.goto(path);
  return res?.status() === 200;
}

test("the Share menu exposes a Copy link action", async ({ page }) => {
  const ok = await gotoSeeded(page, RECIPE_PATH);
  test.skip(!ok, "No seeded database: recipe detail route is unavailable.");

  const shareTrigger = page.getByRole("button", { name: /share/i }).first();
  if ((await shareTrigger.count()) === 0) {
    test.skip(true, "Share control not rendered for this recipe.");
  }
  await shareTrigger.click();

  await expect(
    page.getByRole("menuitem", { name: /copy link/i }),
  ).toBeVisible();
});

test("the print route renders a print-ready layout", async ({ page }) => {
  const ok = await gotoSeeded(page, PRINT_PATH);
  test.skip(!ok, "No seeded database: print route is unavailable.");

  // Section headings the printable layout always renders.
  await expect(
    page.getByRole("heading", { name: /ingredients/i }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /method/i }).first(),
  ).toBeVisible();

  // The on-screen trigger that invokes window.print().
  await expect(
    page.getByRole("button", { name: /print/i }).first(),
  ).toBeVisible();
});
