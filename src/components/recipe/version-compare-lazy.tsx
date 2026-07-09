"use client";

import dynamic from "next/dynamic";

import type { VersionCompareProps } from "./version-compare";

// Below-the-fold history affordance: keep the diff engine + UI out of the
// recipe detail route's first-load JS (#358) and load it on demand.
const VersionCompare = dynamic(
  () => import("./version-compare").then((m) => m.VersionCompare),
  { ssr: false },
);

export function VersionCompareLazy(props: VersionCompareProps) {
  return <VersionCompare {...props} />;
}
