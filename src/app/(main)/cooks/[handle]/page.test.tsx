import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { createTranslator } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HandleRouteParams } from '~/lib/route-params';
import type { getCurrentUser } from '~/server/auth';
import type { getPublicProfileByHandle } from '~/server/users/queries';
import en from '~/messages/en.json';
import { makeRecipe, makeUser } from '~/test/factories';
import { IntlWrapper } from '~/test/intl';

const state = vi.hoisted(() => ({
  profile: vi.fn<typeof getPublicProfileByHandle>(),
  viewer: vi.fn<typeof getCurrentUser>(),
  configured: true,
  counts: vi.fn(),
  following: vi.fn(),
  followProps: vi.fn(),
}));
vi.mock('~/server/users/queries', () => ({ getPublicProfileByHandle: state.profile }));
vi.mock('~/server/auth', () => ({
  getCurrentUser: state.viewer,
  isAuthConfigured: () => state.configured,
}));
vi.mock('~/server/follows/queries', () => ({
  getFollowCounts: state.counts,
  isFollowing: state.following,
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: 'cooks.profile') =>
    createTranslator({ locale: 'en', messages: en, namespace }),
}));
vi.mock('~/components/i18n/route-messages', () => ({
  withRouteMessages: (
    Page: (props: { params: Promise<HandleRouteParams> }) => Promise<ReactNode>,
  ) => Page,
}));
vi.mock('~/components/follows/follow-button', () => ({
  FollowButton: (props: Record<string, unknown>) => {
    state.followProps(props);
    return <button type="button">Follow control</button>;
  },
}));
vi.mock('~/components/recipe/recipe-card', () => ({
  RecipeCard: ({ recipe }: { recipe: { title: string } }) => <article>{recipe.title}</article>,
}));

import CookProfilePage from './page';

const owner = makeUser({ id: 'public-cook', publicActivityOptIn: true });

async function renderProfile(publicActivityOptIn = true) {
  state.profile.mockResolvedValue({
    user: { ...owner, publicActivityOptIn },
    recipes: [{ ...makeRecipe({ title: 'Family fixture recipe' }), author: owner, tags: [] }],
  });
  render(
    <IntlWrapper>
      {await CookProfilePage({ params: Promise.resolve({ handle: owner.handle! }) })}
    </IntlWrapper>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  state.configured = true;
  state.viewer.mockResolvedValue(null);
  state.counts.mockResolvedValue({ followers: 2, following: 3 });
  state.following.mockResolvedValue(false);
});
afterEach(cleanup);

describe('public profile follow routing (#1202)', () => {
  it.each([false, true])(
    'passes guest and configured=%s without losing public content',
    async (configured) => {
      state.configured = configured;
      await renderProfile();
      expect(state.followProps).toHaveBeenCalledWith(
        expect.objectContaining({
          followeeId: owner.id,
          initialFollowing: false,
          signedIn: false,
          authConfigured: configured,
        }),
      );
      expect(state.following).not.toHaveBeenCalled();
      expect(screen.getByRole('heading', { name: owner.name! })).toBeVisible();
      expect(screen.getByRole('article')).toHaveTextContent('Family fixture recipe');
    },
  );

  it('passes authenticated following state for the same opted-in profile', async () => {
    const viewer = makeUser({ id: 'other-cook' });
    state.viewer.mockResolvedValue(viewer);
    state.following.mockResolvedValue(true);
    await renderProfile();
    expect(state.following).toHaveBeenCalledWith(viewer.id, owner.id);
    expect(state.followProps).toHaveBeenCalledWith(
      expect.objectContaining({ signedIn: true, initialFollowing: true }),
    );
  });

  it('does not render a follow control for the opted-in viewer themselves', async () => {
    state.viewer.mockResolvedValue(owner);
    await renderProfile();
    expect(state.followProps).not.toHaveBeenCalled();
    expect(state.following).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: owner.name! })).toBeVisible();
  });

  it.each([null, makeUser({ id: 'other-cook' })])(
    'keeps opted-out graphs hidden for guest and authenticated viewers',
    async (viewer) => {
      state.viewer.mockResolvedValue(viewer);
      await renderProfile(false);
      expect(state.followProps).not.toHaveBeenCalled();
      expect(state.counts).not.toHaveBeenCalled();
      expect(state.following).not.toHaveBeenCalled();
      expect(screen.queryByRole('link', { name: /followers|following/i })).not.toBeInTheDocument();
      expect(screen.getByRole('article')).toHaveTextContent('Family fixture recipe');
    },
  );
});
