"use client";

import dynamic from "next/dynamic";

// Lazy-load the read-aloud client bundle (#387) so its speech-synthesis logic
// and controls stay out of the recipe page's first-load budget (#206). It is a
// progressive enhancement — the steps are server-rendered and this only drives
// them — so deferring it to an on-demand chunk that loads after hydration is a
// meaningful, behaviour-preserving trim.
const ReadAloudButtonImpl = dynamic(
  () => import("./read-aloud-button").then((mod) => mod.ReadAloudButton),
  { ssr: false },
);

export function ReadAloudButton(props: {
  steps: string[];
  anchorPrefix: string;
  className?: string;
}) {
  return <ReadAloudButtonImpl {...props} />;
}
