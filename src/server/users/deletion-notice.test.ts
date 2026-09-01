import { describe, expect, it } from 'vitest';

import ar from '~/messages/ar.json';
import de from '~/messages/de.json';
import en from '~/messages/en.json';
import es from '~/messages/es.json';

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
      expect(del.export.body).toBeTruthy();
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
});
