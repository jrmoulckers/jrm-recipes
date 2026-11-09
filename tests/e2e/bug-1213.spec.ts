import { expect, test, type Locator } from '@playwright/test';

import en from '../../src/messages/en.json' with { type: 'json' };
import es from '../../src/messages/es.json' with { type: 'json' };
import ar from '../../src/messages/ar.json' with { type: 'json' };
import { gotoSeededRecipe } from './recipe-paths';

async function expectBoundedTabs(list: Locator) {
  const geometry = await list.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const parent = element.parentElement!.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth;
    return {
      listInside:
        bounds.left >= Math.max(0, parent.left) - 1 &&
        bounds.right <= Math.min(viewport, parent.right) + 1,
      targetsInside: [...element.querySelectorAll('[role="tab"]')].every((tab) => {
        const target = tab.getBoundingClientRect();
        return (
          target.width > 0 &&
          target.left >= bounds.left - 1 &&
          target.right <= bounds.right + 1 &&
          target.top >= bounds.top - 1 &&
          target.bottom <= bounds.bottom + 1
        );
      }),
      overflow: element.scrollWidth - element.clientWidth,
      documentX: window.scrollX,
    };
  });
  expect(geometry.listInside, 'Recipe tab list stays inside its parent and viewport').toBe(true);
  expect(geometry.targetsInside, 'All four tab targets stay inside the list').toBe(true);
  expect(geometry.overflow, 'Tab labels stay inside the navigation').toBeLessThanOrEqual(1);
  expect(geometry.documentX, 'Using recipe tabs must not pan the document').toBe(0);
}

for (const [locale, messages] of [
  ['en', en],
  ['es', es],
  ['ar', ar],
] as const) {
  for (const width of [320, 363, 390, 739, 1280]) {
    test(`recipe tabs stay reachable at ${width}px in ${locale} (#1213)`, async ({
      page,
      context,
      baseURL,
    }) => {
      test.setTimeout(60_000);
      if (!baseURL) throw new Error('Recipe tab regression requires a configured baseURL.');
      await page.setViewportSize({ width, height: 1029 });
      await context.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: baseURL }]);
      const path = await gotoSeededRecipe(page);
      expect(path, 'Recipe tab regression requires the seeded recipe').not.toBeNull();
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');

      const list = page.getByRole('tablist').filter({
        has: page.locator('#recipe-tab-trigger'),
      });
      const tabs = list.getByRole('tab');
      await expect(tabs).toHaveCount(4);
      await list.scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollTo(0, window.scrollY));
      await expectBoundedTabs(list);

      const labels = (['recipe', 'timeline', 'cooked', 'discussion'] as const).map(
        (value) => messages.recipeDetail.tabs[value],
      );
      const recipeLabelledBy = await page.getByRole('tabpanel').getAttribute('aria-labelledby');
      expect(recipeLabelledBy, 'Recipe retains its existing panel label reference').toBeTruthy();
      await expect(tabs).toHaveText(labels);
      for (let index = 0; index < labels.length; index += 1) {
        const tab = tabs.nth(index);
        await expect(tab.locator('svg')).toHaveCount(1);
        await tab.click();
        await expect(tab).toHaveAttribute('aria-selected', 'true');
        const panelId = await tab.getAttribute('aria-controls');
        if (!panelId) throw new Error('Recipe tab is missing its panel association.');
        const panel = page.getByRole('tabpanel');
        await expect(panel).toHaveCount(1);
        await expect(panel).toHaveAttribute('id', panelId);
        // Preserve the inherited Recipe IDREF baseline; its repair belongs to #1250.
        await expect(panel).toHaveAttribute(
          'aria-labelledby',
          index === 0 ? recipeLabelledBy! : (await tab.getAttribute('id'))!,
        );
        await expectBoundedTabs(list);
      }

      const pointerShadow = await tabs
        .last()
        .evaluate((element) => getComputedStyle(element).boxShadow);
      await tabs.last().focus();
      await page.keyboard.press('Home');
      await expect(tabs.first()).toBeFocused();
      await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('ArrowRight');
      await expect(tabs.nth(1)).toBeFocused();
      await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('ArrowLeft');
      await expect(tabs.first()).toBeFocused();
      await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('End');
      await expect(tabs.last()).toBeFocused();
      await expect(tabs.last()).toHaveAttribute('aria-selected', 'true');
      expect(
        await tabs.last().evaluate((element) => element.matches(':focus-visible')),
        'Keyboard-selected tab must retain visible-focus styling',
      ).toBe(true);
      expect(
        await tabs.last().evaluate((element) => getComputedStyle(element).boxShadow),
        'Keyboard focus must add a visible ring, not only the active-tab shadow',
      ).not.toBe(pointerShadow);
      await expectBoundedTabs(list);

      if (width === 739 || width === 1280) {
        const tops = await tabs.evaluateAll((elements) =>
          elements.map((element) => element.getBoundingClientRect().top),
        );
        expect(
          Math.max(...tops) - Math.min(...tops),
          'Desktop retains one row',
        ).toBeLessThanOrEqual(1);
      }

      await tabs.evaluateAll((elements) => {
        for (const element of elements) {
          const label = element.textContent!.trim();
          for (const node of [...element.childNodes]) {
            if (node.nodeType === Node.TEXT_NODE) node.remove();
          }
          element.append(document.createTextNode(` ${label} ${label}`));
        }
      });
      await expect(tabs).toHaveText(labels.map((label) => `${label} ${label}`));
      for (let index = 0; index < labels.length; index += 1) {
        await expect(tabs.nth(index)).toHaveCSS('white-space', 'nowrap');
      }
      await expectBoundedTabs(list);
      await tabs.last().click();
      await expect(tabs.last()).toHaveAttribute('aria-selected', 'true');
      await expectBoundedTabs(list);
    });
  }
}
