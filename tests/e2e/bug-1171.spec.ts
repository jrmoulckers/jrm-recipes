import { expect, test, type Page } from '@playwright/test';
import postgres from 'postgres';

// These tests share reversible ingredient links in the seeded recipe.
test.describe.configure({ mode: 'default' });
test.use({ viewport: { width: 1194, height: 1030 } });

let linkedIngredients: string[] = [];

test.beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error('This spec requires a seeded E2E DATABASE_URL');
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    // The demo seed predates food-graph linking; ingredient search requires these FKs.
    const rows = await sql<{ id: string }[]>`
      update recipe_ingredients ingredient
      set food_id = food.id
      from food_items food
      where ingredient.recipe_id = 'seed_rcp_marinara'
        and ingredient.item in ('basil', 'sugar')
        and lower(food.name) = ingredient.item
        and ingredient.food_id is null
      returning ingredient.id
    `;
    linkedIngredients = rows.map((row) => row.id);
    const linked = await sql`
      select id from recipe_ingredients
      where recipe_id = 'seed_rcp_marinara'
        and item in ('basil', 'sugar') and food_id is not null
    `;
    expect(linked).toHaveLength(2);
  } finally {
    await sql.end();
  }
});

test.afterAll(async () => {
  if (!linkedIngredients.length) return;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    await sql`
      update recipe_ingredients set food_id = null
      where recipe_id = 'seed_rcp_marinara' and id in ${sql(linkedIngredients)}
    `;
  } finally {
    await sql.end();
  }
});

async function holdNavigation(page: Page, key: string, value: string) {
  let release!: () => void;
  let ready!: () => void;
  let requests = 0;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const responseReady = new Promise<void>((resolve) => (ready = resolve));
  await page.route('**/recipes?*', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get(key) !== value || !url.searchParams.has('_rsc')) {
      await route.continue();
      return;
    }
    requests += 1;
    const response = await route.fetch();
    ready();
    await gate;
    await route.fulfill({ response });
  });
  return { release, responseReady, requestCount: () => requests };
}

for (const scenario of [
  {
    label: 'Search recipes',
    key: 'q',
    first: 'na',
    latest: 'marinara',
    initial: '/recipes?q=n&ingredient=basil',
  },
  {
    label: 'Filter by ingredient',
    key: 'ingredient',
    first: 'garlic',
    latest: 'sugar',
    initial: '/recipes?q=marinara&ingredient=basil',
  },
]) {
  test(`bug #1171: ${scenario.label} survives an older response before the next debounce`, async ({
    page,
    context,
  }) => {
    await page.goto(scenario.initial);
    const input = page.getByRole('searchbox', { name: scenario.label });
    const held = await holdNavigation(page, scenario.key, scenario.first);
    try {
      await input.fill(scenario.first);
      await held.responseReady;
      const updating = page.getByRole('status', { name: /^Updating results/ });
      await expect(updating).toBeVisible();
      await page.waitForTimeout(350);
      expect.soft(held.requestCount()).toBe(1);
      await input.fill(scenario.latest);
      await input.evaluate((element) => {
        const values: string[] = [];
        const observer = new MutationObserver(() => {
          values.push((element as HTMLInputElement).value);
        });
        observer.observe(element, { attributes: true, attributeFilter: ['value'] });
        Object.assign(element, { searchValues: values, searchObserver: observer });
      });
      await page.waitForTimeout(50);
      held.release();
      await expect(page).toHaveURL((url) => url.searchParams.get(scenario.key) === scenario.latest);
      await expect(input).toHaveValue(scenario.latest);
      await expect(updating).toHaveCount(0);
      await expect(
        page.getByRole('heading', { name: 'Weeknight Garden Marinara', exact: true }),
      ).toBeVisible();
      const values = await input.evaluate((element) => {
        const observed = element as HTMLInputElement & {
          searchValues: string[];
          searchObserver: MutationObserver;
        };
        observed.searchObserver.disconnect();
        return observed.searchValues;
      });
      expect(values).not.toContain(scenario.first);
      const fresh = await context.newPage();
      try {
        await fresh.goto(page.url());
        await expect(fresh.getByRole('searchbox', { name: scenario.label })).toHaveValue(
          scenario.latest,
        );
        await expect(
          fresh.getByRole('heading', { name: 'Weeknight Garden Marinara', exact: true }),
        ).toBeVisible();
        expect(await page.getByRole('main').locator('h2, h3').allTextContents()).toEqual(
          await fresh.getByRole('main').locator('h2, h3').allTextContents(),
        );
      } finally {
        await fresh.close();
      }
    } finally {
      held.release();
    }
  });
}

test('bug #1171: one clear affordance works during navigation and keeps keyboard focus', async ({
  page,
}) => {
  await page.goto('/recipes?q=n&ingredient=basil');
  const input = page.getByRole('searchbox', { name: 'Search recipes' });
  await input.focus();
  await input.hover();
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument', { depth: -1, pierce: true });
    const { nodeId } = await session.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: 'input[type="search"]',
    });
    const { node } = await session.send('DOM.describeNode', { nodeId });
    const shadowRoot = node.shadowRoots?.[0];
    expect(shadowRoot).toBeDefined();
    const nativeCancel = await session.send('DOM.querySelector', {
      nodeId: shadowRoot!.nodeId,
      selector: '[pseudo="-webkit-search-cancel-button"]',
    });
    expect(nativeCancel.nodeId).not.toBe(0);
    const { computedStyle } = await session.send('CSS.getComputedStyleForNode', nativeCancel);
    expect(computedStyle.find((property) => property.name === 'display')?.value).toBe('none');
  } finally {
    await session.detach();
  }
  const clearButton = page.getByRole('button', { name: 'Clear search', exact: true });
  const box = await clearButton.boundingBox();
  expect(box).not.toBeNull();
  // Probe outside the custom button's 44px hit area, not its overlapping left edge.
  await page.mouse.click(box!.x - 8, box!.y + box!.height / 2);
  await expect(input).toHaveValue('n');
  const held = await holdNavigation(page, 'q', 'na');
  try {
    await input.fill('na');
    await held.responseReady;
    const clear = page.getByRole('button', { name: 'Clear search', exact: true });
    await expect(clear).toHaveCount(1);
    await clear.click();
    await expect(input).toHaveValue('');
    await expect(input).toBeFocused();
    held.release();
    await expect(page).toHaveURL(
      (url) => !url.searchParams.has('q') && url.searchParams.get('ingredient') === 'basil',
    );
    await expect(input).toHaveValue('');
    await expect(clear).toHaveCount(0);
  } finally {
    held.release();
  }
});

test('bug #1171: combined drafts preserve quick filters and intentional back/forward', async ({
  page,
}) => {
  await page.goto('/recipes?q=n&ingredient=basil');
  const query = page.getByRole('searchbox', { name: 'Search recipes' });
  const ingredient = page.getByRole('searchbox', { name: 'Filter by ingredient' });
  await query.fill('marinara');
  await ingredient.fill('sugar');
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get('q') === 'marinara' && url.searchParams.get('ingredient') === 'sugar',
  );
  await page.getByRole('button', { name: 'Weeknight', exact: true }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get('q') === 'marinara' &&
      url.searchParams.get('ingredient') === 'sugar' &&
      url.searchParams.get('maxTime') === '30',
  );
  await query.fill('unsent');
  await page.goBack();
  await expect(query).toHaveValue('marinara');
  await expect(ingredient).toHaveValue('sugar');
  await expect(page).toHaveURL((url) => !url.searchParams.has('maxTime'));
  await page.goForward();
  await expect(page).toHaveURL((url) => url.searchParams.get('maxTime') === '30');
  await expect(query).toHaveValue('marinara');
  await expect(ingredient).toHaveValue('sugar');
});
