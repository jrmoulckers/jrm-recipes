import { expect, test, type APIRequestContext, type Request } from '@playwright/test';
import postgres from 'postgres';

const baseURL = `http://localhost:${process.env.E2E_PORT ?? '43153'}`;
const ownerState = '.clerk/owner-e2e.json';
test.setTimeout(90_000);

type ActionRequest = {
  url: string;
  body: Buffer;
  headers: Record<string, string>;
};

function actionRequest(request: Request): ActionRequest {
  const body = request.postDataBuffer();
  if (!body) throw new Error('The intercepted owner delete action had no body');
  const originalHeaders = request.headers();
  const actionId = originalHeaders['next-action'];
  const contentType = originalHeaders['content-type'];
  if (!actionId || !contentType) throw new Error('The owner delete action lacks required headers');
  return {
    url: request.url(),
    body,
    headers: {
      'next-action': actionId,
      'content-type': contentType,
      origin: new URL(request.url()).origin,
    },
  };
}

async function replayAction(context: APIRequestContext, action: ActionRequest) {
  return context.post(action.url, {
    data: action.body,
    headers: action.headers,
    failOnStatusCode: false,
  });
}

test('Clerk owner controls and mutation are inaccessible to a genuinely signed-out visitor', async ({
  browser,
}) => {
  if (!process.env.DATABASE_URL) throw new Error('Clerk E2E requires DATABASE_URL');
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  const owner = await browser.newContext({ storageState: ownerState });
  const visitor = await browser.newContext();
  try {
    const ownerPage = await owner.newPage();
    const visitorPage = await visitor.newPage();

    await visitorPage.goto('/');
    await expect(
      visitorPage.locator('header').getByRole('button', { name: 'Sign in' }),
    ).toBeVisible();
    await expect(
      visitorPage.locator('header').getByRole('button', { name: 'Start your cookbook' }),
    ).toBeVisible();
    await expect(visitorPage.locator('header').getByRole('button', { name: /user/i })).toHaveCount(
      0,
    );
    await ownerPage.goto('/recipes/new');
    await expect(ownerPage.getByPlaceholder("Grandma's Sunday Marinara")).toBeVisible();
    await expect(ownerPage.locator('header').getByRole('button', { name: 'Sign in' })).toHaveCount(
      0,
    );

    const title = `Clerk E2E owner gate ${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await ownerPage.getByPlaceholder("Grandma's Sunday Marinara").fill(title);
    await ownerPage
      .getByRole('button', { name: /visibility settings: only me, published/i })
      .click();
    await ownerPage.getByRole('combobox', { name: 'Who can see this?' }).selectOption('public');
    await ownerPage.getByRole('button', { name: /save recipe/i }).click();
    await expect(ownerPage).toHaveURL(/\/recipes\/[^/]+\/[^/]+$/);
    const recipePath = new URL(ownerPage.url()).pathname;
    const rows = await sql<{ id: string; author_id: string; deleted_at: Date | null }[]>`
      select id, author_id, deleted_at from recipes where title = ${title}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.author_id).not.toBeNull();
    expect(rows[0]!.deleted_at).toBeNull();
    const recipeId = rows[0]!.id;

    await ownerPage.goto(recipePath);
    await ownerPage.getByRole('button', { name: /more recipe actions/i }).click();
    await expect(ownerPage.getByRole('link', { name: 'Edit', exact: true })).toBeVisible();
    await expect(ownerPage.getByRole('button', { name: /^delete$/i })).toBeVisible();

    await visitorPage.goto(recipePath);
    await expect(visitorPage.getByRole('heading', { name: title })).toBeVisible();
    await visitorPage.getByRole('button', { name: /more recipe actions/i }).click();
    await expect(visitorPage.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
    await expect(visitorPage.getByRole('button', { name: /^delete$/i })).toHaveCount(0);
    await visitorPage.goto(`${recipePath}/edit`);
    await expect(visitorPage).toHaveURL(`${baseURL}${recipePath}`);
    await expect(visitorPage.getByRole('heading', { name: title })).toBeVisible();
    await expect(visitorPage.getByPlaceholder("Grandma's Sunday Marinara")).toHaveCount(0);

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
    const denied = await replayAction(visitor.request, captured!);
    expect(denied.ok()).toBe(false);
    const [afterDenied] = await sql<{ deleted_at: Date | null }[]>`
      select deleted_at from recipes where id = ${recipeId}
    `;
    expect(afterDenied?.deleted_at).toBeNull();

    const allowed = await replayAction(owner.request, captured!);
    expect(allowed.ok()).toBe(true);
    const [afterOwner] = await sql<{ deleted_at: Date | null }[]>`
      select deleted_at from recipes where id = ${recipeId}
    `;
    expect(afterOwner?.deleted_at).not.toBeNull();
  } finally {
    await owner.close();
    await visitor.close();
    await sql.end();
  }
});
