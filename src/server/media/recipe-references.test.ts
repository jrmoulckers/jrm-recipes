import { describe, expect, it } from 'vitest';

import { recipeSnapshotMediaUrls } from './recipe-references';

describe('recipeSnapshotMediaUrls', () => {
  it('includes original images that are preserved only in version history', () => {
    expect(
      recipeSnapshotMediaUrls({
        coverImageUrl: 'https://example.com/cover.jpg',
        sourceImages: [{ imageUrl: 'https://example.com/detached-card.jpg' }],
        steps: [
          {
            imageUrl: 'https://example.com/step.jpg',
            videoUrl: 'https://example.com/step.mp4',
            captionUrl: 'https://example.com/step.vtt',
          },
        ],
      }),
    ).toEqual([
      'https://example.com/cover.jpg',
      'https://example.com/detached-card.jpg',
      'https://example.com/step.jpg',
      'https://example.com/step.mp4',
      'https://example.com/step.vtt',
    ]);
  });

  it('ignores absent legacy fields', () => {
    expect(recipeSnapshotMediaUrls({ steps: [] })).toEqual([]);
  });
});
