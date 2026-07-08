import { type FlagMap, type FlagValue } from "./flags-shared";

export { type FlagMap, type FlagValue } from "./flags-shared";

/**
 * Resolve a (possibly multivariate) flag from a bootstrapped map, falling back
 * to control when the flag is absent or the map is missing. Pure so both the
 * SSR helper and the client hook share one, unit-tested resolution rule.
 */
export function resolveFlag(
  flags: FlagMap | undefined,
  key: string,
  fallback: FlagValue = false,
): FlagValue {
  if (!flags || !(key in flags)) return fallback;
  return flags[key]!;
}

/** True when a flag is on — any value other than `false`/absent (covers variants). */
export function isFlagEnabled(value: FlagValue | undefined): boolean {
  return value !== undefined && value !== false;
}
