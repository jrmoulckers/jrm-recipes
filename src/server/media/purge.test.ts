import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('~/env', () => ({ env: {} }));
vi.mock('~/server/db', () => ({ db: {} }));

import { collectUserAssets } from './purge';

const SOURCE_URL =
  'https://res.cloudinary.com/demo/image/upload/v1/heirloom/recipe-sources/card.jpg';

function executorWithForeignSourceAsset(
  departingAssets: Record<string, unknown>[] = [],
  foreignAssets: Record<string, unknown>[] = [
    {
      publicId: 'heirloom/recipe-sources/card',
      resourceType: 'image',
      url: SOURCE_URL,
    },
  ],
) {
  const mediaFindMany = vi
    .fn()
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce(departingAssets)
    .mockResolvedValueOnce(foreignAssets);
  const emptyFindMany = vi.fn().mockResolvedValue([]);
  const limit = vi.fn().mockResolvedValue([]);
  const executor = {
    query: {
      mediaAssets: { findMany: mediaFindMany },
      recipes: {
        findMany: vi.fn().mockResolvedValue([{ id: 'fork-1', coverImageUrl: null }]),
      },
      recipeSourceImages: {
        findMany: vi.fn().mockResolvedValue([{ imageUrl: SOURCE_URL }]),
      },
      recipeSteps: { findMany: emptyFindMany },
      recipeVersions: { findMany: emptyFindMany },
      cookLogEntries: { findMany: emptyFindMany },
      reviews: { findMany: emptyFindMany },
      collections: { findMany: emptyFindMany },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit })),
      })),
    })),
  };
  return executor;
}

describe('collectUserAssets', () => {
  it("does not claim an original image still owned by another fork's uploader", async () => {
    const executor = executorWithForeignSourceAsset();

    const result = await collectUserAssets(
      'departing-fork-owner',
      executor as unknown as Parameters<typeof collectUserAssets>[1],
    );

    expect(result.refs).toEqual([]);
  });

  it('protects a legacy foreign row by URL when the departing row has a public id', async () => {
    const executor = executorWithForeignSourceAsset(
      [
        {
          provider: 'cloudinary',
          publicId: 'heirloom/recipe-sources/card',
          resourceType: 'image',
          url: SOURCE_URL,
        },
      ],
      [{ publicId: null, resourceType: 'image', url: SOURCE_URL }],
    );

    const result = await collectUserAssets(
      'departing-uploader',
      executor as unknown as Parameters<typeof collectUserAssets>[1],
    );

    expect(result.refs).toEqual([]);
  });
});
