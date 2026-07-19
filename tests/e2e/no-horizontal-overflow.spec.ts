import { expect, test } from "@playwright/test";

// Regression guard for the mobile pinch-zoom-out bug (header action row
// overflow). When any element renders wider than the viewport, mobile Safari
// widens the layout viewport to fit it, which lets the user pinch-zoom out
// below fit-to-width into a shrunken, margin-padded view. The document's
// scroll width must never exceed the viewport width at our 320px minimum.
const routes = ["/", "/recipes", "/collections", "/profile"];

// 320px = iPhone SE / smallest supported width; 390px = iPhone 14.
for (const width of [320, 390]) {
  test(`no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });

    for (const route of routes) {
      const response = await page.goto(route);
      expect(response?.ok(), `${route} should load`).toBe(true);

      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));

      // Allow a 1px rounding tolerance; anything larger means a real overflow.
      expect(
        scrollWidth,
        `${route} at ${width}px overflows horizontally (scrollWidth=${scrollWidth}, viewport=${innerWidth})`,
      ).toBeLessThanOrEqual(innerWidth + 1);
    }
  });
}
