import { createId } from '@paralleldrive/cuid2';
import { expect, test } from '@playwright/test';
import postgres from 'postgres';

const DEV_IDENTITY_COOKIE = 'heirloom_dev_identity';
const GUEST_IDENTITY = 'e2e_signed_out';
const OWNER_ID = 'dev_local_user_00000000';

test('guest follow retains the public profile and authenticated follow still toggles (#1202)', async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(90_000);
  if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
    throw new Error('The follow regression requires the local E2E server.');
  }
  if (process.env.E2E_IDENTITY_SELECTOR !== '1') {
    throw new Error('The follow regression requires E2E_IDENTITY_SELECTOR=1.');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !['localhost', '127.0.0.1'].includes(new URL(databaseUrl).hostname)) {
    throw new Error('The follow fixture requires a local seeded E2E DATABASE_URL.');
  }
  const sql = postgres(databaseUrl, { max: 1 });
  const cookId = createId();
  const recipeId = createId();
  const handle = `bug-1202-${cookId}`;
  const title = 'Follow regression family recipe';
  const profilePath = `/cooks/${handle}`;
  const actionRequests: string[] = [];

  try {
    await page.setViewportSize({ width: 1280, height: 720 });
    await context.addCookies([
      { name: 'NEXT_LOCALE', value: 'en', url: baseURL },
      { name: DEV_IDENTITY_COOKIE, value: OWNER_ID, url: baseURL },
    ]);
    await sql.begin(async (tx) => {
      await tx`
        insert into users (id, name, handle, slug, public_activity_opt_in)
        values (${cookId}, 'Follow fixture cook', ${handle}, ${handle}, true)
      `;
      await tx`
        insert into recipes (id, slug, title, author_id, visibility, status)
        values (${recipeId}, 'family-recipe', ${title}, ${cookId}, 'public', 'published')
      `;
    });

    await context.addCookies([{ name: DEV_IDENTITY_COOKIE, value: GUEST_IDENTITY, url: baseURL }]);
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.headers()['next-action']) {
        actionRequests.push(request.url());
      }
    });
    await page.goto(profilePath);
    const profile = page.locator('main');
    await expect(profile.getByRole('heading', { name: 'Follow fixture cook' })).toBeVisible();
    await expect(profile.getByRole('link', { name: title, exact: true })).toBeVisible();
    const guestFollow = profile.getByRole('button', { name: 'Follow', exact: true });
    // This local bypass has no Clerk provider; modal behavior is covered separately.
    await expect(guestFollow).toBeDisabled();
    await guestFollow.evaluate((button: HTMLButtonElement) => button.click());
    await expect(profile.getByRole('heading', { name: 'Follow fixture cook' })).toBeVisible();
    await expect(profile.getByRole('link', { name: title, exact: true })).toBeVisible();
    await expect(page.getByText('Something went wrong', { exact: true })).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe(profilePath);
    expect(actionRequests).toEqual([]);
    const guestEdges = await sql`select id from follows where followee_id = ${cookId}`;
    expect(guestEdges).toHaveLength(0);

    await context.addCookies([{ name: DEV_IDENTITY_COOKIE, value: OWNER_ID, url: baseURL }]);
    await page.reload();
    await profile.getByRole('button', { name: 'Follow', exact: true }).click();
    await expect(profile.getByRole('button', { name: 'Following', exact: true })).toBeEnabled();
    await expect
      .poll(async () => {
        const edges = await sql`
        select id from follows where follower_id = ${OWNER_ID} and followee_id = ${cookId}
      `;
        return edges.length;
      })
      .toBe(1);
    await profile.getByRole('button', { name: 'Following', exact: true }).click();
    await expect(profile.getByRole('button', { name: 'Follow', exact: true })).toBeEnabled();
    await expect
      .poll(async () => {
        const edges = await sql`
        select id from follows where follower_id = ${OWNER_ID} and followee_id = ${cookId}
      `;
        return edges.length;
      })
      .toBe(0);
    await expect(profile.getByRole('link', { name: title, exact: true })).toBeVisible();

    await sql`update users set public_activity_opt_in = false where id = ${cookId}`;
    await page.reload();
    await expect(profile.getByRole('button', { name: /^(Follow|Following)$/ })).toHaveCount(0);
    await expect(profile.getByRole('link', { name: /followers|following/i })).toHaveCount(0);
    await expect(profile.getByRole('link', { name: title, exact: true })).toBeVisible();
  } finally {
    try {
      await sql`delete from recipes where id = ${recipeId} and author_id = ${cookId}`;
      await sql`delete from users where id = ${cookId} and handle = ${handle}`;
    } finally {
      await sql.end();
    }
  }
});
