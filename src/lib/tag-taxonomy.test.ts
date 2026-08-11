import { describe, expect, it } from 'vitest';

import en from '~/messages/en.json';

import {
  canonicalizeTag,
  isCanonicalTag,
  parseClassificationList,
  recipeCategoriesInText,
  recipeCategoryForTag,
  recipeCategoryInText,
  SUGGESTED_TAGS,
} from './tag-taxonomy';

describe('canonicalizeTag (#282)', () => {
  it('folds known aliases onto their canonical tag', () => {
    expect(canonicalizeTag('veggie')).toEqual({
      slug: 'vegetarian',
      name: 'Vegetarian',
      category: 'dietary',
    });
    expect(canonicalizeTag('gf')).toEqual({
      slug: 'gluten-free',
      name: 'Gluten-Free',
      category: 'dietary',
    });
    expect(canonicalizeTag('bbq')).toEqual({
      slug: 'barbecue',
      name: 'Barbecue',
      category: 'general',
    });
    expect(canonicalizeTag('crockpot')).toEqual({
      slug: 'slow-cooker',
      name: 'Slow Cooker',
      category: 'general',
    });
    expect(canonicalizeTag('entree')).toEqual({
      slug: 'main-course',
      name: 'Main Course',
      category: 'meal',
    });
  });

  it('is case- and spacing-insensitive', () => {
    expect(canonicalizeTag('  Gluten Free ').slug).toBe('gluten-free');
    expect(canonicalizeTag('WEEK NIGHT').slug).toBe('weeknight');
    expect(canonicalizeTag('Non-Dairy').slug).toBe('dairy-free');
  });

  it('maps a canonical name/slug to itself', () => {
    expect(canonicalizeTag('Vegetarian')).toEqual({
      slug: 'vegetarian',
      name: 'Vegetarian',
      category: 'dietary',
    });
    expect(canonicalizeTag('gluten-free').slug).toBe('gluten-free');
  });

  it('passes unknown free-form tags through with a normalized slug', () => {
    expect(canonicalizeTag("Grandma's Secret")).toEqual({
      slug: 'grandmas-secret',
      name: "Grandma's Secret",
      category: 'general',
    });
    // Unknown tags are not forced into the vocabulary.
    expect(isCanonicalTag("Grandma's Secret")).toBe(false);
  });

  it('collapses distinct aliases to a single canonical slug', () => {
    const a = canonicalizeTag('veggie');
    const b = canonicalizeTag('Vegetarian');
    const c = canonicalizeTag('vegetarians');
    expect(new Set([a.slug, b.slug, c.slug]).size).toBe(1);
  });

  it('uses hints for custom values but never overrides curated categories', () => {
    expect(canonicalizeTag('tea time', 'meal')).toMatchObject({
      slug: 'tea-time',
      name: 'Tea Time',
      category: 'meal',
    });
    expect(canonicalizeTag('italian', 'general')).toMatchObject({
      slug: 'italian',
      name: 'Italian',
      category: 'cuisine',
    });
  });
});

describe('SUGGESTED_TAGS (#282)', () => {
  it('exposes a de-duplicated, alphabetized vocabulary', () => {
    const slugs = SUGGESTED_TAGS.map((t) => t.slug);
    // Hand-written floor: the uniqueness assertion below is 0 === 0 on an
    // empty vocabulary, so it cannot detect SUGGESTED_TAGS emptying (#862).
    expect(slugs.length).toBeGreaterThan(50);
    expect(new Set(slugs).size).toBe(slugs.length);
    const names = SUGGESTED_TAGS.map((t) => t.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  describe('parseClassificationList', () => {
    it('accepts localized commas and de-dupes casing', () => {
      expect(parseClassificationList('Breakfast، brunch, breakfast, Main   Course')).toEqual([
        'Breakfast',
        'brunch',
        'Main Course',
      ]);
    });
  });

  it('every suggested tag canonicalizes to itself', () => {
    for (const tag of SUGGESTED_TAGS) {
      expect(canonicalizeTag(tag.name)).toEqual(tag);
      expect(isCanonicalTag(tag.name)).toBe(true);
    }
  });

  it('provides a localized display key for every controlled value', () => {
    const labels = en.classificationNames as Record<string, string>;
    for (const tag of SUGGESTED_TAGS) {
      expect(labels[tag.slug], tag.slug).toBeTruthy();
    }
  });
});

describe('recipe category normalization', () => {
  it('shares canonical meal aliases across exact tags and longer text', () => {
    expect(recipeCategoryForTag('brunch')).toBe('Breakfast');
    expect(recipeCategoryForTag('main-course')).toBe('Main');
    expect(recipeCategoryInText('Easy brunch pancakes')).toBe('Breakfast');
  });

  it('does not match meal terms embedded inside other words', () => {
    expect(recipeCategoryInText('Breakfasted at dawn')).toBeUndefined();
  });

  it('returns all course terms from mixed recipe titles', () => {
    expect(recipeCategoriesInText('Lunch Dumpling Soup')).toEqual(['Lunch', 'Soup']);
  });
});
