import { createId } from '@paralleldrive/cuid2';
import { expect, test } from '@playwright/test';
import postgres from 'postgres';

import { gotoSeededRecipe } from './recipe-paths';

test('German comparison localizes metadata labels, not author values (#1198)', async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(60_000);
  if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
    throw new Error('The comparison fixture requires the local E2E server.');
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  const seededPath = await gotoSeededRecipe(page);
  expect(seededPath, 'The comparison regression requires the seeded database').not.toBeNull();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('The comparison fixture requires DATABASE_URL.');

  const sql = postgres(databaseUrl, { max: 1 });
  const recipeId = createId();
  const slug = `bug-1198-${recipeId}`;
  const title = 'Family comparison fixture';
  const snapshot = {
    title,
    servings: 4,
    servingsNoun: 'bowls',
    totalMinutes: 15,
    cuisines: ['Italian'],
    mealTypes: ['Dinner'],
    ingredients: [],
    steps: [],
    sourceImages: [],
    tags: [],
    equipment: [],
    dietaryFlags: [],
    visibility: 'public',
    status: 'published',
  };

  try {
    const [owner] = await sql<{ id: string; slug: string }[]>`
      select u.id, u.slug
      from users u
      join recipes r on r.author_id = u.id
      where r.id = 'seed_rcp_gravy'
    `;
    if (!owner) throw new Error('The seeded recipe owner is missing.');
    await sql.begin(async (tx) => {
      await tx`
        insert into recipes
          (id, slug, title, author_id, visibility, status, servings, servings_noun, total_minutes)
        values
          (${recipeId}, ${slug}, ${title}, ${owner.id}, 'public', 'published', 4, 'plates', 30)
      `;
      await tx`
        insert into recipe_versions
          (id, recipe_id, version_number, label, author_id, snapshot)
        values
          (${createId()}, ${recipeId}, 1, 'Family original', ${owner.id}, ${tx.json(snapshot)})
      `;
    });

    await context.addCookies([{ name: 'NEXT_LOCALE', value: 'de', url: baseURL }]);
    await page.goto(`/recipes/${owner.slug}/${slug}`);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await page.getByRole('tab', { name: 'Verlauf', exact: true }).click();
    const comparison = page.getByRole('region', { name: 'Rezeptversionen vergleichen' });
    await expect(comparison).toBeVisible();
    await expect(
      comparison.getByRole('combobox', { name: 'Vergleichen ab Version' }),
    ).toContainText('v1 · Family original');
    await expect(
      comparison.getByRole('combobox', { name: 'Vergleichen bis Version' }),
    ).toContainText('Aktuelles Rezept');
    await comparison.getByRole('button', { name: 'Vergleichen', exact: true }).click();
    await expect(comparison.getByText('4 geändert', { exact: true })).toBeVisible();
    await expect(comparison.getByRole('heading', { name: 'Einzelheiten' })).toBeVisible();

    const rows = comparison.getByRole('listitem');
    await expect(rows).toHaveCount(4);
    for (const [index, label, before, after] of [
      [0, 'Portionseinheit', 'bowls', 'plates'],
      [1, 'Gesamtzeit', '15', '30'],
      [2, 'Küchen', 'Italian', '—'],
      [3, 'Mahlzeiten und Gänge', 'Dinner', '—'],
    ] as const) {
      const row = rows.nth(index);
      await expect(row.locator(':scope > span')).toHaveText(label);
      await expect(row.getByText(before, { exact: true })).toBeVisible();
      await expect(row.getByText(after, { exact: true })).toBeVisible();
    }
    for (const label of ['Serving unit', 'Total time', 'Cuisines', 'Meals & courses']) {
      await expect(comparison.getByText(label, { exact: true })).toHaveCount(0);
    }
    await test.info().attach('bug-1198-german-comparison', {
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
