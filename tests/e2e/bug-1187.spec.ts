import { createId } from '@paralleldrive/cuid2';
import { expect, test } from '@playwright/test';
import postgres from 'postgres';

import ar from '../../src/messages/ar.json' with { type: 'json' };
import de from '../../src/messages/de.json' with { type: 'json' };
import en from '../../src/messages/en.json' with { type: 'json' };
import es from '../../src/messages/es.json' with { type: 'json' };

type Ingredient = {
  item: string;
  quantity: number;
  unit: string | null;
};

test.describe.configure({ retries: 0 });

// Authored snapshot supplied by the coordinator, not an existing seeded recipe
// or a replay of the original production journey.
const carbonara: Ingredient[] = [
  { item: 'spaghetti', quantity: 400, unit: 'g' },
  { item: 'pancetta', quantity: 150, unit: 'g' },
  { item: 'large eggs', quantity: 4, unit: null },
  { item: 'egg yolks', quantity: 2, unit: null },
  { item: 'parmesan', quantity: 100, unit: 'g' },
  { item: 'black pepper', quantity: 1, unit: 'tsp' },
  { item: 'salt', quantity: 1, unit: 'tsp' },
];
const complete: Ingredient[] = [
  { item: 'bread flour', quantity: 500, unit: 'g' },
  { item: 'water', quantity: 350, unit: 'g' },
  { item: 'salt', quantity: 10, unit: 'g' },
  { item: 'levain', quantity: 100, unit: 'g' },
];
const unknown: Ingredient[] = [
  { item: 'large eggs', quantity: 4, unit: null },
  { item: 'egg yolks', quantity: 2, unit: null },
  { item: 'black pepper', quantity: 1, unit: 'tsp' },
];

test('partial batch and per-piece weights disclose omitted lines, unlike complete weights (#1187)', async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const loopbackHosts = ['localhost', '127.0.0.1', '[::1]'];
  if (!baseURL || !loopbackHosts.includes(new URL(baseURL).hostname)) {
    throw new Error('#1187 requires a loopback E2E server.');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !loopbackHosts.includes(new URL(databaseUrl).hostname)) {
    throw new Error('#1187 requires a loopback E2E DATABASE_URL.');
  }
  if (process.env.E2E_DISPOSABLE_DATABASE !== '1') {
    throw new Error(
      '#1187 creates and removes owned fixtures. Set E2E_DISPOSABLE_DATABASE=1 only for a disposable local/CI database wired to this server.',
    );
  }
  const health = await page.request.get('/api/health');
  expect(health.ok(), 'The local server and database must be healthy').toBe(true);
  expect(await health.json()).toMatchObject({ status: 'ok', db: 'ok' });

  const sql = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 5,
    connection: { statement_timeout: 10_000 },
  });
  const fixtures = [
    { id: createId(), kind: 'partial', ingredients: carbonara },
    { id: createId(), kind: 'complete', ingredients: complete },
    { id: createId(), kind: 'unknown', ingredients: unknown },
  ] as const;
  try {
    const [owner] = await sql<{ id: string; slug: string }[]>`
      select u.id, u.slug
      from users u
      join recipes r on r.author_id = u.id
      where r.id = 'seed_rcp_gravy'
    `;
    if (!owner?.slug) {
      throw new Error('#1187 requires the seeded demo owner; no fixture was substituted.');
    }

    await sql.begin(async (tx) => {
      for (const fixture of fixtures) {
        await tx`
          insert into recipes
            (id, slug, title, author_id, visibility, status, servings, servings_noun)
          values
            (${fixture.id}, ${`bug-1187-${fixture.id}`},
             ${`Bug 1187 ${fixture.kind} fixture`}, ${owner.id},
             'public', 'published', 4, ${fixture.kind === 'partial' ? 'servings' : null})
        `;
        for (const [position, ingredient] of fixture.ingredients.entries()) {
          await tx`
            insert into recipe_ingredients
              (id, recipe_id, position, item, quantity, unit)
            values
              (${createId()}, ${fixture.id}, ${position}, ${ingredient.item},
               ${ingredient.quantity}, ${ingredient.unit})
          `;
        }
      }
    });

    for (const [locale, messages] of [
      ['en', en],
      ['es', es],
      ['de', de],
      ['ar', ar],
    ] as const) {
      await context.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: baseURL }]);
      const copy = messages.ingredientsPanel;
      const grams = (value: number) => `${new Intl.NumberFormat(locale).format(value)} g`;
      const omittedPrefix = copy.omittedBatchWeights.split('{ingredients}')[0]!;
      const omission = copy.omittedBatchWeights.replace(
        '{ingredients}',
        new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format([
          'large eggs',
          'egg yolks',
          'black pepper',
        ]),
      );

      for (const width of [1194, 363]) {
        await page.setViewportSize({ width, height: 1030 });
        for (const [index, fixture] of fixtures.entries()) {
          await test.step(`${index + 1}. ${fixture.kind} coverage (${locale}, ${width}px)`, async () => {
            const response = await page.goto(`/recipes/${owner.slug}/bug-1187-${fixture.id}`);
            expect(response?.ok(), 'The disposable recipe must render').toBe(true);
            await expect(
              page.getByRole('heading', {
                name: `Bug 1187 ${fixture.kind} fixture`,
                exact: true,
              }),
            ).toBeVisible();
            await expect(page.locator('html')).toHaveAttribute('lang', locale);
            await expect(page.locator('html')).toHaveAttribute(
              'dir',
              locale === 'ar' ? 'rtl' : 'ltr',
            );
            await page.getByRole('button', { name: copy.system.grams, exact: true }).click();

            const pieces = page.getByRole('spinbutton', { name: copy.pieceCountAria });
            if (fixture.kind === 'unknown') {
              await expect(pieces).toHaveCount(0);
              await expect(page.getByText(copy.batchWeight, { exact: false })).toHaveCount(0);
              await expect(page.getByText(copy.partialBatchWeight, { exact: false })).toHaveCount(
                0,
              );
              await expect(page.getByText(omittedPrefix, { exact: false })).toHaveCount(0);
              return;
            }

            await expect(pieces).toBeVisible();
            await pieces.fill(fixture.kind === 'partial' ? '8' : '12');
            const label = fixture.kind === 'partial' ? copy.partialBatchWeight : copy.batchWeight;
            const batch = page.getByText(
              `${label} ${grams(fixture.kind === 'partial' ? 656 : 960)}`,
              {
                exact: true,
              },
            );
            await expect(batch).toBeVisible();
            const each = (value: number) =>
              (fixture.kind === 'partial' ? copy.partialEach : copy.each).replace(
                '{weight}',
                grams(value),
              );
            await expect(
              page.getByText(each(fixture.kind === 'partial' ? 82 : 80), { exact: true }),
            ).toBeVisible();

            if (fixture.kind === 'partial') {
              await expect(page.getByText(omission, { exact: true })).toBeVisible();
              await expect(
                page.getByText(copy.each.replace('{weight}', grams(82)), { exact: true }),
              ).toHaveCount(0);
              await pieces.fill('4');
              await expect(page.getByText(each(164), { exact: true })).toBeVisible();
              await expect(batch).toBeVisible();
              if (locale === 'en' && width === 1194) {
                await page.getByRole('button', { name: 'More servings', exact: true }).click();
                await expect(
                  page.getByText(`${label} ${grams(820)}`, { exact: true }),
                ).toBeVisible();
                await expect(page.getByText(each(205), { exact: true })).toBeVisible();
                await expect(page.getByText(omission, { exact: true })).toBeVisible();
                await page.getByRole('button', { name: copy.fewerServings, exact: true }).click();
                await expect(batch).toBeVisible();
                await expect(page.getByText(each(164), { exact: true })).toBeVisible();
                await pieces.fill('8');
                await page.getByRole('button', { name: copy.scaleTo, exact: true }).click();
                await page
                  .getByRole('combobox', { name: copy.ingredient, exact: true })
                  .selectOption({
                    label: 'spaghetti',
                  });
                await page
                  .getByRole('spinbutton', { name: copy.targetAmount, exact: true })
                  .fill('150');
                await page.getByRole('button', { name: copy.apply, exact: true }).click();
                await expect(
                  page.getByText(`${label} ${grams(246)}`, { exact: true }),
                ).toBeVisible();
                await expect(page.getByText(each(31), { exact: true })).toBeVisible();
                await expect(page.getByText(omission, { exact: true })).toBeVisible();
                await expect(pieces).toHaveValue('8');
                await page.getByRole('button', { name: copy.reset, exact: true }).click();
                await expect(batch).toBeVisible();
                await expect(page.getByText(each(82), { exact: true })).toBeVisible();
                await expect(pieces).toHaveValue('8');
                await pieces.fill('');
                await expect(page.getByText(each(164), { exact: true })).toBeVisible();
              }
              const measureHelper = () =>
                batch.locator('..').evaluate((helper) => {
                  const rect = helper.getBoundingClientRect();
                  return {
                    scrollWidth: helper.scrollWidth,
                    clientWidth: helper.clientWidth,
                    left: rect.left,
                    right: rect.right,
                    viewportWidth: document.documentElement.clientWidth,
                    innerWidth: window.innerWidth,
                    documentScrollWidth: document.documentElement.scrollWidth,
                    scrollX: window.scrollX,
                    focus: document.activeElement?.getAttribute('aria-label'),
                  };
                });
              const beforeScreenshot = await measureHelper();
              await test.info().attach(`bug-1187-${locale}-${width}-partial`, {
                body: await page.screenshot({ fullPage: true }),
                contentType: 'image/png',
              });
              const afterScreenshot = await measureHelper();
              await test.info().attach(`bug-1187-${locale}-${width}-geometry`, {
                body: Buffer.from(JSON.stringify({ beforeScreenshot, afterScreenshot }, null, 2)),
                contentType: 'application/json',
              });
              for (const [phase, geometry] of Object.entries({
                beforeScreenshot,
                afterScreenshot,
              })) {
                expect(
                  geometry.scrollWidth,
                  `${phase}: helper contents fit its client width`,
                ).toBeLessThanOrEqual(geometry.clientWidth);
                expect(
                  geometry.left,
                  `${phase}: helper starts inside the viewport`,
                ).toBeGreaterThanOrEqual(0);
                expect(
                  geometry.right,
                  `${phase}: helper ends inside the viewport`,
                ).toBeLessThanOrEqual(geometry.viewportWidth);
              }
            } else {
              await expect(page.getByText(copy.partialBatchWeight, { exact: false })).toHaveCount(
                0,
              );
              await expect(page.getByText(omittedPrefix, { exact: false })).toHaveCount(0);
            }
          });
        }
      }
    }
  } finally {
    try {
      for (const fixture of fixtures) {
        await sql`
          delete from recipes
          where id = ${fixture.id} and slug = ${`bug-1187-${fixture.id}`}
        `;
      }
    } finally {
      await sql.end();
    }
  }
});
