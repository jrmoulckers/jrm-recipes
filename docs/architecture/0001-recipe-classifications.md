# ADR 0001: Typed Recipe Classifications

- **Status:** Accepted
- **Date:** 2026-04-13
- **Issue:** [#609](https://github.com/jrmoulckers/jrm-recipes/issues/609)

## Context

Recipes historically used free-form tags for meals and a single nullable `cuisine` string. That
allowed multiple meal labels through tags, but capitalization and aliases fragmented discovery,
while cuisine could not represent recipes that belong to more than one culinary tradition.
Dietary metadata already had separate declared and ingredient-derived sources whose provenance
must remain trustworthy.

## Decision

Use the existing `tags` and `recipe_tags` relationship as a shared, multi-value classification
model. Every tag has one category:

- `meal` for meals and courses such as Breakfast, Brunch, Main Course, and Dessert.
- `cuisine` for culinary traditions such as Italian, Chinese, and Mediterranean.
- `dietary` for the controlled dietary vocabulary.
- `general` for all other free-form tags.

A central taxonomy canonicalizes known names and aliases to a stable slug, display name, and
category. Unknown values remain allowed, use a normalized display name, and retain the category
supplied by the authoring surface. The globally unique tag slug keeps existing tag URLs stable and
prevents case-only duplicates. If an unknown slug already exists in another category, later writes
preserve its established category instead of reclassifying every recipe that shares it. Controlled
vocabulary categories are deterministic and migration aliases are merged into their canonical row.

The editor and imports accept multiple meals and cuisines. Search composes categories with `AND`;
multiple meals or cuisines within their category use `OR`, while multiple general or dietary
filters use `AND`.

## Compatibility

The nullable `recipes.cuisine` column remains as a temporary first-cuisine projection for older
readers. Writes store every cuisine through `recipe_tags` and mirror the canonical display name of
the first cuisine into the legacy column. Reads fall back to that column only when no classified
cuisine link exists.

The migration is additive: it adds the category enum and column, canonicalizes known existing tag
labels, creates cuisine links from legacy values, and adds indexes for category facets. Existing
tag routes and recipe records remain valid.

## Dietary Trust Boundary

`recipes.dietary_flags` contains explicit author declarations, and `recipes.dietary_tags` contains
claims derived from ingredient analysis. These remain the only sources used by dietary safety
filters. A free-form tag whose text resembles a dietary claim does not become a declaration and
does not satisfy a dietary safety filter. Persisted tag links use general tag filtering even when
their controlled label is dietary; only trusted declared or derived badges link to dietary safety
filters. Classification presentation may organize the controlled vocabulary, but it must not erase
that provenance distinction.

## Consequences

- A recipe can belong to multiple meals, courses, and cuisines.
- Display names and aliases converge without removing free-form tagging.
- Cards, detail pages, print output, JSON-LD, recommendations, and browse filters use the same
  classification model.
- The legacy cuisine column requires dual writes until a future migration removes compatibility
  readers.
- Dietary filtering stays intentionally separate from generic tag matching.
