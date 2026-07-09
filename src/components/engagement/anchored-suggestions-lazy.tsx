"use client";

import dynamic from "next/dynamic";

import type { AnchoredSuggestionsProps } from "./anchored-suggestions";

// Lazy-load the anchored-suggestions client bundle so its JS stays out of the
// recipe page's first-load budget (#206). It renders once per ingredient row
// and method step, so deferring it to an on-demand chunk is a meaningful trim.
const AnchoredSuggestionsImpl = dynamic(
  () =>
    import("./anchored-suggestions").then((mod) => mod.AnchoredSuggestions),
  { ssr: false },
);

export function AnchoredSuggestions(props: AnchoredSuggestionsProps) {
  return <AnchoredSuggestionsImpl {...props} />;
}
