import type { ComponentProps, ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTranslator } from 'next-intl';

import { SUPPORTED_LOCALES, type Locale } from '~/config/i18n';
import { DEV_USER } from '~/server/auth/dev-user';
import type { User } from '~/server/db/schema';
import type { ShoppingWorkspace } from '~/server/shopping/queries';
import type { DbShoppingList } from '~/components/shopping/db-shopping-list';
import { toUnitPrefs } from '~/lib/unit-prefs';
import ar from '~/messages/ar.json';
import de from '~/messages/de.json';
import en from '~/messages/en.json';
import es from '~/messages/es.json';

type PageProps = { searchParams: Promise<{ list?: string | string[] }> };
type DbProps = ComponentProps<typeof DbShoppingList>;

const state = vi.hoisted(() => ({
  locale: 'en' as Locale,
  dbEnabled: true,
  authConfigured: true,
  getCurrentUser: vi.fn<() => Promise<User | null>>(),
  getShoppingWorkspace:
    vi.fn<(user: User | null, listId?: string) => Promise<ShoppingWorkspace | null>>(),
  getShoppingListHistory: vi.fn(),
  listMemberProfiles: vi.fn(),
  dbShoppingList: vi.fn(),
  localShoppingList: vi.fn(),
  authControls: vi.fn(),
}));
const catalogs = { en, de, es, ar };

vi.mock('next-intl/server', () => ({
  getTranslations: async () =>
    createTranslator({
      locale: state.locale,
      messages: catalogs[state.locale],
      namespace: 'shopping.page',
    }),
}));
vi.mock('~/server/auth', () => ({
  getCurrentUser: state.getCurrentUser,
  isAuthConfigured: () => state.authConfigured,
}));
vi.mock('~/server/db', () => ({ isDbConfigured: () => state.dbEnabled }));
vi.mock('~/server/shopping/queries', () => ({
  getShoppingWorkspace: state.getShoppingWorkspace,
  getShoppingListHistory: state.getShoppingListHistory,
}));
vi.mock('~/server/dietary/queries', () => ({
  listMemberProfiles: state.listMemberProfiles,
}));
vi.mock('~/components/i18n/route-messages', () => ({
  withRouteMessages: (Page: (props: PageProps) => Promise<ReactNode>) => Page,
}));
vi.mock('~/components/shopping/db-shopping-list', () => ({
  DbShoppingList: (props: DbProps) => {
    state.dbShoppingList(props);
    return <button type="button">New list</button>;
  },
}));
vi.mock('~/components/shopping/local-shopping-list', () => ({
  LocalShoppingList: (props: { selectedListId?: string }) => {
    state.localShoppingList(props);
    return <div data-testid="local-shopping-list" />;
  },
}));
vi.mock('~/components/auth/auth-controls', () => ({
  AuthControls: (props: { isConfigured: boolean; user: null }) => {
    state.authControls(props);
    return <button type="button">Sign in</button>;
  },
}));

import ShoppingPage from './page';

const emptyWorkspace = {
  lists: [],
  stores: [],
  selectedList: null,
  selectedListId: null,
  defaultListId: null,
  routes: [],
  unitPreferences: toUnitPrefs(null),
  customUnits: [],
  packageRounding: false,
} satisfies ShoppingWorkspace;

async function renderShopping(list?: string | string[]) {
  render(await ShoppingPage({ searchParams: Promise.resolve({ list }) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  state.locale = 'en';
  state.dbEnabled = true;
  state.authConfigured = true;
  state.getCurrentUser.mockResolvedValue(null);
  state.getShoppingWorkspace.mockResolvedValue(emptyWorkspace);
  state.getShoppingListHistory.mockResolvedValue([]);
  state.listMemberProfiles.mockResolvedValue([]);
});
afterEach(cleanup);

describe.each(SUPPORTED_LOCALES)('shopping sign-in state in %s (#1201)', (locale) => {
  beforeEach(() => {
    state.locale = locale;
  });

  it('gates only the anonymous viewer on the same empty workspace', async () => {
    const copy = catalogs[locale].shopping.page;
    await renderShopping();

    expect(screen.getByRole('heading', { level: 1, name: copy.title })).toBeVisible();
    expect(screen.getByRole('heading', { name: copy.signIn.title })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(copy.signIn.body);
    expect(state.authControls).toHaveBeenCalledWith({ isConfigured: true, user: null });
    expect(screen.queryByRole('button', { name: 'New list' })).not.toBeInTheDocument();
    expect(state.dbShoppingList).not.toHaveBeenCalled();
    expect(state.localShoppingList).not.toHaveBeenCalled();
    expect(state.listMemberProfiles).not.toHaveBeenCalled();
    expect(state.getShoppingListHistory).not.toHaveBeenCalled();

    cleanup();
    state.getCurrentUser.mockResolvedValue(DEV_USER);
    await renderShopping();

    expect(screen.queryByText(copy.signIn.title)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New list' })).toBeVisible();
    expect(state.dbShoppingList).toHaveBeenCalledWith({
      items: [],
      lists: [],
      stores: [],
      selectedListId: '',
      defaultListId: '',
      historyEntries: [],
      members: [],
    });
    expect(state.getShoppingWorkspace).toHaveBeenLastCalledWith(DEV_USER, undefined);
    expect(state.authControls).toHaveBeenCalledTimes(1);
  });

  it('explains unavailable sign-in without mounting Clerk or mutation controls', async () => {
    state.authConfigured = false;
    state.getShoppingWorkspace.mockResolvedValue(null);
    await renderShopping('unavailable-list');

    expect(screen.getByRole('status')).toHaveTextContent(
      catalogs[locale].shopping.page.signIn.body,
    );
    expect(screen.getByText(catalogs[locale].shopping.page.signIn.unavailable)).toBeVisible();
    expect(state.authControls).not.toHaveBeenCalled();
    expect(state.dbShoppingList).not.toHaveBeenCalled();
    expect(state.localShoppingList).not.toHaveBeenCalled();
  });
});

it('preserves authenticated populated workspace selection and item mapping (#1201)', async () => {
  const now = new Date(0);
  const list = {
    id: 'list-1',
    userId: DEV_USER.id,
    name: 'Weekly groceries',
    storeName: null,
    isDefault: false,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    stores: [],
    storeIds: [],
    items: [
      {
        id: 'item-1',
        listId: 'list-1',
        item: 'Apples',
        quantity: 2,
        quantityMax: null,
        unit: null,
        requiredBaseQuantity: null,
        requiredBaseQuantityMax: null,
        requiredBaseUnit: null,
        purchaseQuantity: null,
        purchaseUnit: null,
        packageCount: null,
        packageAmount: null,
        packageUnit: null,
        packageLabel: null,
        category: 'Produce',
        note: 'For lunch',
        optional: false,
        checked: false,
        recipeId: null,
        foodId: null,
        position: 0,
        createdAt: now,
        updatedAt: now,
      },
    ],
  } satisfies NonNullable<ShoppingWorkspace['selectedList']>;
  const defaultList = {
    ...list,
    id: 'list-default',
    name: 'Default groceries',
    isDefault: true,
    items: [],
  };
  state.getCurrentUser.mockResolvedValue(DEV_USER);
  state.getShoppingWorkspace.mockResolvedValue({
    ...emptyWorkspace,
    lists: [list, defaultList],
    selectedList: list,
    selectedListId: list.id,
    defaultListId: defaultList.id,
  });
  await renderShopping([list.id, 'ignored-list']);

  expect(state.getShoppingWorkspace).toHaveBeenCalledWith(DEV_USER, list.id);
  expect(state.getShoppingListHistory).toHaveBeenCalledWith(DEV_USER, list.id);
  expect(state.dbShoppingList).toHaveBeenCalledWith(
    expect.objectContaining({
      selectedListId: list.id,
      defaultListId: defaultList.id,
      lists: [
        {
          id: list.id,
          name: list.name,
          storeIds: [],
          isDefault: false,
          archived: false,
          itemCount: 1,
        },
        {
          id: defaultList.id,
          name: defaultList.name,
          storeIds: [],
          isDefault: true,
          archived: false,
          itemCount: 0,
        },
      ],
      items: [
        expect.objectContaining({
          id: 'item-1',
          item: 'Apples',
          quantity: 2,
          note: 'For lunch',
          checked: false,
        }),
      ],
    }),
  );
  expect(state.authControls).not.toHaveBeenCalled();
  expect(state.localShoppingList).not.toHaveBeenCalled();
});

it.each([true, false])(
  'preserves the DB-unconfigured local fallback with auth configured=%s (#1201)',
  async (authConfigured) => {
    state.dbEnabled = false;
    state.authConfigured = authConfigured;
    state.getShoppingWorkspace.mockResolvedValue(null);
    await renderShopping(['local-list', 'ignored-list']);

    expect(screen.getByTestId('local-shopping-list')).toBeVisible();
    expect(state.localShoppingList).toHaveBeenCalledWith({ selectedListId: 'local-list' });
    expect(state.getCurrentUser).not.toHaveBeenCalled();
    expect(state.authControls).not.toHaveBeenCalled();
    expect(state.dbShoppingList).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  },
);
