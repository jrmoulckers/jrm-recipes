import { describe, expect, it } from 'vitest';

import ar from '~/messages/ar.json';
import de from '~/messages/de.json';
import en from '~/messages/en.json';
import es from '~/messages/es.json';
import { DELETION_NOTICE_VERSION } from './deletion-notice';

const catalogs = { en, de, es, ar } as const;

describe('account and profile deletion disclosure', () => {
  it.each(Object.keys(catalogs) as (keyof typeof catalogs)[])(
    'gives %s readers every shared-content outcome',
    (locale) => {
      const del = catalogs[locale].settings.dataPage.delete;
      const consequences = del.consequences as Record<string, string>;

      expect(consequences.recipesDeleted).toContain('{count, plural,');
      expect(consequences.recipesUnclaimed).toContain('{count, plural,');
      expect(consequences.coCreated).toContain('{count, plural,');
      expect(consequences.coCreated).toContain('{versions, plural,');
      expect(consequences.photos).toContain('{retained, plural,');
      expect(consequences.dietaryDeleted).toContain('{profiles, plural,');
      expect(consequences.dietaryDeleted).toContain('{restrictions, plural,');
      expect(consequences.dietaryDeleted).toContain('{assessments, plural,');
      expect(consequences.dietaryRetained).toContain('{assessments, plural,');
      expect(consequences.dietaryRetained).toContain('{corrections, plural,');
      expect(del.export.body).toBeTruthy();
    },
  );

  it.each(Object.keys(catalogs) as (keyof typeof catalogs)[])(
    'explains the private group association in %s',
    (locale) => {
      const profileFields = catalogs[locale].dietary.fields;
      expect(profileFields.familyGroupPrivacy).toBeTruthy();
    },
  );

  it.each(Object.keys(catalogs) as (keyof typeof catalogs)[])(
    'has no obsolete held-erasure branch in %s',
    (locale) => {
      const del = catalogs[locale].settings.dataPage.delete as Record<string, unknown>;
      expect(del.held).toBeUndefined();
    },
  );

  it('does not promise unconditional full deletion in English', () => {
    const del = en.settings.dataPage.delete;
    expect(del.description).toContain('may remain');
    expect(del.confirm.help).toContain('Shared content remains');
    expect(del.toasts.deleted).not.toContain('everything');
  });

  it('records a new notice version for dietary deletion consequences', () => {
    expect(DELETION_NOTICE_VERSION).toBe('2026-09-dietary-rights-v3');
  });
});
