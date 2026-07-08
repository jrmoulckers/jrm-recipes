import { DEFAULT_LOCALE } from "~/config/i18n";

/** How a list should be joined: "a, b, and c" vs "a, b, or c". */
export type ListType = "conjunction" | "disjunction";

/**
 * Join a list of human-readable strings the way a given locale would — e.g.
 * English `["a","b","c"]` → `"a, b, and c"`, Spanish → `"a, b y c"`, Arabic →
 * `"a وb وc"`. Hand-rolled `" and "` / `.join(", ")` bakes English grammar (and
 * the Oxford comma) into every locale; {@link Intl.ListFormat} defers to CLDR
 * instead.
 *
 * Use only for user-facing prose. Machine-facing joins (URL params, JSON-LD,
 * CSV/print export, form round-trips) must stay a plain `.join()` so their
 * output is stable and parseable.
 *
 * Falls back to the default locale (never throws) when handed an invalid tag,
 * and returns `""` for an empty list.
 */
export function formatList(
  items: Iterable<string>,
  locale: string = DEFAULT_LOCALE,
  type: ListType = "conjunction",
): string {
  const list = Array.from(items);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0] ?? "";
  try {
    return new Intl.ListFormat(locale, { style: "long", type }).format(list);
  } catch {
    return new Intl.ListFormat(DEFAULT_LOCALE, { style: "long", type }).format(
      list,
    );
  }
}
