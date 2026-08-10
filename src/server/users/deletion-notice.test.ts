import { describe, expect, it } from "vitest";

import ar from "~/messages/ar.json";
import de from "~/messages/de.json";
import en from "~/messages/en.json";
import es from "~/messages/es.json";

/**
 * Pin the co-creator disclosure in every locale.
 *
 * Since #685 an accepted co-creator can edit a recipe they do not own, so
 * erasure leaves the departing user's prose inside somebody else's
 * `recipes.story`/`notes` and inside `recipe_versions` snapshots authored by
 * other people. The erasure path does not remove it and, until #678 picks a
 * remedy, will not.
 *
 * The notice therefore has to say so. A version of this sentence that mentions
 * only the byline coming off would describe an erasure the system does not
 * perform, which is the failure mode the whole pre-confirmation notice exists to
 * prevent. These assertions are deliberately about the *presence of a
 * limitation*, not about wording: a translator may rephrase freely, but nobody
 * should be able to quietly delete the disclosure while the gap is still open.
 *
 * When #678 lands a remedy that genuinely removes the text, this test should be
 * removed in the same change that removes the sentence, not before.
 */
const catalogs = { en, de, es, ar } as const;

/** A phrase each locale uses for "what you wrote stays". */
const disclosure: Record<keyof typeof catalogs, string> = {
  en: "Anything you wrote",
  de: "Was du darin geschrieben hast",
  es: "Lo que hayas escrito",
  ar: "ويبقى ما كتبته فيها",
};

describe("co-created recipe disclosure", () => {
  it.each(Object.keys(catalogs) as (keyof typeof catalogs)[])(
    "tells %s readers that their contributions stay behind",
    (locale) => {
      const message =
        catalogs[locale].settings.dataPage.delete.consequences.coCreated;
      expect(message).toContain(disclosure[locale]);
    },
  );

  it.each(Object.keys(catalogs) as (keyof typeof catalogs)[])(
    "keeps the disclosure in every non-zero plural form for %s",
    (locale) => {
      const message =
        catalogs[locale].settings.dataPage.delete.consequences.coCreated;
      // Plural arms look like `one {...}`. The `=0` arm says the user has no
      // co-created recipes at all, so it has nothing to disclose.
      const arms = [...message.matchAll(/(?:^|\s)(=0|\w+) \{/g)].map(
        (match) => match[1]!,
      );
      expect(arms.length).toBeGreaterThan(1);

      const occurrences = message.split(disclosure[locale]).length - 1;
      const expected = arms.filter((arm) => arm !== "=0").length;
      expect(occurrences).toBe(expected);
    },
  );
});
