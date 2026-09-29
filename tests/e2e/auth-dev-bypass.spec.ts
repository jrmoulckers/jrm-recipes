import { expect, test, type APIRequestContext, type Request } from '@playwright/test';
import postgres from 'postgres';

// These literals are pinned to the server allowlist by e2e-containment.test.ts.
const DEV_IDENTITY_COOKIE = 'heirloom_dev_identity';
const OWNER_ID = 'dev_local_user_00000000';
const CO_COOK_ID = 'e2e_usr_cocook_000000';
const BASE_URL = `http://localhost:${process.env.E2E_PORT ?? '3000'}`;
test.setTimeout(90_000);

type ActionRequest = {
  url: string;
  body: Buffer;
  headers: Record<string, string>;
};

function actionRequest(request: Request): ActionRequest {
  const body = request.postDataBuffer();
  if (!body) throw new Error('The intercepted server action had no body');
  const headers = request.headers();
  // Let each context supply its own cookie; the request must never carry the
  // owner's session into the non-owner replay.
  delete headers.cookie;
  delete headers['content-length'];
  return { url: request.url(), body, headers };
}

async function replayAction(context: APIRequestContext, action: ActionRequest): Promise<void> {
  const response = await context.post(action.url, {
    data: action.body,
    headers: action.headers,
    failOnStatusCode: true,
  });
  expect(response.ok()).toBe(true);
}

test('dev identities gate owner controls and refuse a non-owner delete action', async ({
  browser,
}) => {
  if (!process.env.DATABASE_URL) throw new Error('This spec requires a seeded E2E DATABASE_URL');
  if (process.env.E2E_IDENTITY_SELECTOR !== '1') {
    throw new Error('This spec requires E2E_IDENTITY_SELECTOR=1');
  }
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  const owner = await browser.newContext();
  const nonOwner = await browser.newContext();
  try {
    await nonOwner.addCookies([{ name: DEV_IDENTITY_COOKIE, value: CO_COOK_ID, url: BASE_URL }]);
    const ownerPage = await owner.newPage();
    const nonOwnerPage = await nonOwner.newPage();

    // An absent selector cookie is the authenticated Home Cook, not signed out.
    await ownerPage.goto('/recipes/new');
    await expect(ownerPage.locator('header').getByText('HC', { exact: true })).toBeVisible();
    await nonOwnerPage.goto('/recipes/new');
    await expect(nonOwnerPage.locator('header').getByText('EC', { exact: true })).toBeVisible();
    await expect(nonOwnerPage.getByPlaceholder("Grandma's Sunday Marinara")).toBeVisible();

    // Create an isolated owner-owned fixture instead of relying on the seeded
    // recipe, which the co-creator spec can independently modify.
    const title = `E2E owner gate ${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await ownerPage.getByPlaceholder("Grandma's Sunday Marinara").fill(title);
    await ownerPage
      .getByRole('button', { name: /visibility settings: only me, published/i })
      .click();
    await ownerPage.getByRole('combobox', { name: 'Who can see this?' }).selectOption('public');
    await ownerPage.getByRole('button', { name: /save recipe/i }).click();
    await expect(ownerPage).toHaveURL(/\/recipes\/home-cook\/[^/]+$/);
    const recipePath = new URL(ownerPage.url()).pathname;
    const rows = await sql<{ id: string; author_id: string; deleted_at: Date | null }[]>`
      select id, author_id, deleted_at from recipes where title = ${title}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.author_id).toBe(OWNER_ID);
    expect(rows[0]!.deleted_at).toBeNull();
    const recipeId = rows[0]!.id;

    await ownerPage.goto(recipePath);
    await ownerPage.getByRole('button', { name: /more recipe actions/i }).click();
    await expect(ownerPage.getByRole('link', { name: 'Edit', exact: true })).toBeVisible();
    await expect(ownerPage.getByRole('button', { name: /^delete$/i })).toBeVisible();

    await nonOwnerPage.goto(recipePath);
    await expect(nonOwnerPage.getByRole('heading', { name: title })).toBeVisible();
    await nonOwnerPage.getByRole('button', { name: /more recipe actions/i }).click();
    await expect(nonOwnerPage.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
    await expect(nonOwnerPage.getByRole('button', { name: /^delete$/i })).toHaveCount(0);
    await nonOwnerPage.goto(`${recipePath}/edit`);
    await expect(nonOwnerPage.getByPlaceholder("Grandma's Sunday Marinara")).toHaveCount(0);

    // Capture the genuine owner UI's server-action POST, but do not execute it.
    // Replay the identical payload under the other identity first; then replay
    // it as owner to show that the payload can in fact delete this recipe.
    let captured: ActionRequest | undefined;
    await ownerPage.route('**/recipes/**', async (route) => {
      if (route.request().method() !== 'POST' || !route.request().headers()['next-action']) {
        await route.continue();
        return;
      }
      captured = actionRequest(route.request());
      await route.abort();
    });
    await ownerPage.getByRole('button', { name: /^delete$/i }).click();
    await ownerPage.getByRole('alertdialog').getByRole('button', { name: 'Delete recipe' }).click();
    await expect.poll(() => captured).toBeDefined();
    await replayAction(nonOwner.request, captured!);
    const [afterDenied] = await sql<{ deleted_at: Date | null }[]>`
      select deleted_at from recipes where id = ${recipeId}
    `;
    expect(afterDenied?.deleted_at).toBeNull();
    await replayAction(owner.request, captured!);
    const [afterOwner] = await sql<{ deleted_at: Date | null }[]>`
      select deleted_at from recipes where id = ${recipeId}
    `;
    expect(afterOwner?.deleted_at).not.toBeNull();
  } finally {
    await owner.close();
    await nonOwner.close();
    await sql.end();
  }
});
