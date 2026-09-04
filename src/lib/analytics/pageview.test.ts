import { describe, expect, it } from 'vitest';

import { normalizePathname } from './pageview';

describe('normalizePathname', () => {
  it('passes through static routes unchanged', () => {
    for (const path of [
      '/',
      '/recipes',
      '/recipes/new',
      '/groups',
      '/collections',
      '/journal',
      '/plan',
      '/shopping',
    ]) {
      expect(normalizePathname(path)).toBe(path);
    }
  });

  it('collapses recipe ids to :id', () => {
    expect(normalizePathname('/recipes/abc123def456')).toBe('/recipes/:id');
    expect(normalizePathname('/recipes/abc123/edit')).toBe('/recipes/:id/edit');
    expect(normalizePathname('/recipes/abc123/cook')).toBe('/recipes/:id/cook');
    expect(normalizePathname('/recipes/abc123/print')).toBe('/recipes/:id/print');
  });

  it('collapses namespaced, unclaimed, and embedded recipe identifiers', () => {
    expect(normalizePathname('/recipes/private-cook/private-recipe')).toBe(
      '/recipes/:cook/:recipe',
    );
    expect(normalizePathname('/recipes/private-cook/private-recipe/keepsake')).toBe(
      '/recipes/:cook/:recipe/keepsake',
    );
    expect(normalizePathname('/recipes/unclaimed/private-id')).toBe('/recipes/unclaimed/:id');
    expect(normalizePathname('/embed/recipes/private-id')).toBe('/embed/recipes/:id');
  });

  it('collapses collection ids to :id', () => {
    expect(normalizePathname('/collections/xyz789')).toBe('/collections/:id');
  });

  it('collapses group slugs to :slug and keeps static children', () => {
    expect(normalizePathname('/groups/the-smiths')).toBe('/groups/:slug');
    expect(normalizePathname('/groups/the-smiths/settings')).toBe('/groups/:slug/settings');
  });

  it('collapses cook handles', () => {
    expect(normalizePathname('/cooks/private-handle')).toBe('/cooks/:handle');
    expect(normalizePathname('/cooks/private-handle/followers')).toBe('/cooks/:handle/followers');
  });

  it('collapses share and invite bearer tokens', () => {
    expect(normalizePathname('/r/private-recipe-share-token')).toBe('/r/:token');
    expect(normalizePathname('/join/private-group-invite-token')).toBe('/join/:token');
  });

  it('never leaves a real slug or id in the normalized path', () => {
    const normalized = normalizePathname('/groups/private-family-name/settings');
    expect(normalized).not.toContain('private-family-name');
  });

  it('is resilient to empty input', () => {
    expect(normalizePathname('')).toBe('/');
  });
});
