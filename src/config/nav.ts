import {
  BookOpen,
  CalendarDays,
  ChefHat,
  Compass,
  CookingPot,
  Heart,
  Home,
  ShoppingCart,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Route } from "next";

/**
 * Keys into the `nav` message namespace (see src/messages/*.json). Every primary
 * destination is localized rather than shipping a hardcoded English `label`, so
 * the header, mobile tab bar, and "More" menu all read in the active locale.
 */
export type NavLabelKey =
  | "home"
  | "recipes"
  | "discover"
  | "saved"
  | "plan"
  | "journal"
  | "shopping"
  | "family"
  | "create";

/**
 * Stable identity for a nav destination, decoupled from its route so the
 * user's pinned-tab preference survives href changes. We reuse the label key
 * since it is already unique per destination.
 */
export type NavKey = NavLabelKey;

export type NavItem = {
  /** Stable id used to persist bottom-bar pin/order preferences. */
  id: NavKey;
  href: Route;
  /** Key into the `nav` message namespace. */
  labelKey: NavLabelKey;
  icon: LucideIcon;
  /** Match nested routes (e.g. /recipes/*) for active state. */
  match?: (pathname: string) => boolean;
  /**
   * Seed the default mobile bottom bar with this destination. Users can pin a
   * different set (see {@link DEFAULT_MOBILE_PINNED}); this only feeds the
   * out-of-the-box defaults.
   */
  mobile?: boolean;
};

export const primaryNav: NavItem[] = [
  {
    id: "home",
    href: "/",
    labelKey: "home",
    icon: Home,
    match: (p) => p === "/",
    mobile: true,
  },
  {
    id: "recipes",
    href: "/recipes",
    labelKey: "recipes",
    icon: BookOpen,
    // Exclude the create route so "Recipes" and "Create" never both read as
    // active on /recipes/new.
    match: (p) => p.startsWith("/recipes") && p !== "/recipes/new",
    mobile: true,
  },
  {
    id: "discover",
    href: "/discover",
    labelKey: "discover",
    icon: Compass,
    match: (p) => p.startsWith("/discover"),
  },
  {
    id: "saved",
    href: "/collections",
    labelKey: "saved",
    icon: Heart,
    match: (p) => p.startsWith("/collections"),
  },
  {
    id: "plan",
    href: "/plan",
    labelKey: "plan",
    icon: CalendarDays,
    match: (p) => p.startsWith("/plan"),
    mobile: true,
  },
  {
    id: "journal",
    href: "/journal",
    labelKey: "journal",
    icon: CookingPot,
    match: (p) => p.startsWith("/journal"),
  },
  {
    id: "shopping",
    href: "/shopping",
    labelKey: "shopping",
    icon: ShoppingCart,
    match: (p) => p.startsWith("/shopping"),
    mobile: true,
  },
  {
    id: "family",
    href: "/groups",
    labelKey: "family",
    icon: Users,
    match: (p) => p.startsWith("/groups"),
  },
  {
    id: "create",
    href: "/recipes/new",
    labelKey: "create",
    icon: ChefHat,
    match: (p) => p === "/recipes/new",
  },
];

/** Lookup a nav destination by its stable {@link NavKey}. */
export const navByKey: Record<NavKey, NavItem> = Object.fromEntries(
  primaryNav.map((item) => [item.id, item]),
) as Record<NavKey, NavItem>;

/**
 * Destinations a user may pin to the mobile bottom bar. "Create" is excluded —
 * it lives as a header CTA and a Profile action rather than a tab (and the
 * bottom bar hides itself on the editor routes anyway).
 */
export const pinnableNav: NavItem[] = primaryNav.filter(
  (item) => item.id !== "create",
);

/** Maximum number of user-pinned tabs; the Profile slot is always the 5th. */
export const MAX_PINNED = 4;

/**
 * Out-of-the-box pinned tabs, matching the historical mobile bar (Home,
 * Recipes, Plan, Shopping). Order here is the default bar order.
 */
export const DEFAULT_MOBILE_PINNED: NavKey[] = pinnableNav
  .filter((item) => item.mobile)
  .map((item) => item.id);

/** True when `key` names a destination the user is allowed to pin. */
export function isPinnableKey(key: string): key is NavKey {
  return pinnableNav.some((item) => item.id === key);
}

/**
 * Normalize an arbitrary (possibly stale/persisted) list of keys into a valid
 * pinned set: only pinnable keys, de-duplicated, capped at {@link MAX_PINNED}.
 * Falls back to {@link DEFAULT_MOBILE_PINNED} when nothing valid remains.
 */
export function normalizePinned(keys: readonly string[]): NavKey[] {
  const seen = new Set<NavKey>();
  const result: NavKey[] = [];
  for (const key of keys) {
    if (isPinnableKey(key) && !seen.has(key)) {
      seen.add(key);
      result.push(key);
      if (result.length >= MAX_PINNED) break;
    }
  }
  return result.length > 0 ? result : [...DEFAULT_MOBILE_PINNED];
}

/** A marketing/informational link surfaced in the site footer. */
export type FooterNavItem = {
  href: Route;
  /** Key into the `footer` message namespace (see src/messages/*.json). */
  labelKey: "pricing" | "billing";
};

/**
 * Secondary links shown in the footer (issues #312 / #319). Kept here so the
 * pricing and billing surfaces have a single source of truth for their routes;
 * labels stay localized via the `footer` message namespace.
 */
export const footerNav: FooterNavItem[] = [
  { href: "/pricing", labelKey: "pricing" },
  { href: "/settings/billing", labelKey: "billing" },
];
