import { createId } from '@paralleldrive/cuid2';
import { expect, test } from '@playwright/test';
import postgres from 'postgres';

import { gotoSeededRecipe } from './recipe-paths';

test('German allergen names persist from recipe detail into Cook Mode (#1210)', async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(60_000);
  if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
    throw new Error('The allergen fixture requires the local E2E server.');
  }
  const seededPath = await gotoSeededRecipe(page);
  expect(seededPath, 'The allergen regression requires the seeded database').not.toBeNull();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('The allergen fixture requires DATABASE_URL.');

  const sql = postgres(databaseUrl, { max: 1 });
  const recipeId = createId();
  const slug = `bug-1210-${recipeId}`;
  const items = ['flour', 'large eggs', 'whole milk'];
  try {
    const [owner] = await sql<{ id: string; slug: string }[]>`
      select u.id, u.slug from users u
      join recipes r on r.author_id = u.id where r.id = 'seed_rcp_gravy'
    `;
    if (!owner) throw new Error('The seeded recipe owner is missing.');
    await sql.begin(async (tx) => {
      await tx`
        insert into recipes (id, slug, title, author_id, visibility, status, servings)
        values (${recipeId}, ${slug}, 'Family allergen fixture', ${owner.id}, 'public', 'published', 4)
      `;
      for (const [position, item] of items.entries()) {
        await tx`
          insert into recipe_ingredients (id, recipe_id, position, item)
          values (${createId()}, ${recipeId}, ${position}, ${item})
        `;
      }
      await tx`
        insert into recipe_steps (id, recipe_id, position, instruction)
        values (${createId()}, ${recipeId}, 0, 'Combine the ingredients.')
      `;
    });

    await context.addCookies([{ name: 'NEXT_LOCALE', value: 'de', url: baseURL }]);
    await page.setViewportSize({ width: 363, height: 1029 });
    const recipePath = `/recipes/${owner.slug}/${slug}`;
    await page.goto(recipePath);
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    for (const label of ['Weizen/Gluten', 'Eier', 'Milchprodukte']) {
      await expect(page.getByTitle(`Enthält ${label}`, { exact: true })).toBeVisible();
    }
    await expect
      .poll(() =>
        page
          .locator('[title^="Enthält "]')
          .evaluateAll((badges) => badges.map((badge) => badge.getAttribute('title'))),
      )
      .toEqual(['Enthält Weizen/Gluten', 'Enthält Eier', 'Enthält Milchprodukte']);
    for (const item of items) {
      await expect(
        page.getByRole('button', { name: new RegExp(`^${item} Enthält `) }),
      ).toBeVisible();
    }
    await expect(page.locator('[title^="Enthält "]')).toHaveCount(3);
    await test.info().attach('bug-1210-german-detail', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    await page.getByRole('link', { name: 'Kochen', exact: true }).click();
    await expect(page).toHaveURL(new URL(`${recipePath}/cook`, baseURL).toString());
    await page.getByTestId('cook-mode-start').click();
    const banner = page.getByRole('region', { name: 'Allergen-Sicherheitscheck' });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(
      'Dieses Rezept enthält: Milchprodukte, Eier und Weizen/Gluten',
    );
    await expect(banner).not.toContainText(/Dairy|Eggs|Wheat\/gluten/);
    await test.info().attach('bug-1210-german-cook', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  } finally {
    try {
      await sql`delete from recipes where id = ${recipeId}`;
    } finally {
      await sql.end();
    }
  }
});
