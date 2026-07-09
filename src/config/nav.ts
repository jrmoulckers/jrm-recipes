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

export type NavItem = {
  href: Route;
  /** Key into the `nav` message namespace. */
  labelKey: NavLabelKey;
  icon: LucideIcon;
  /** Match nested routes (e.g. /recipes/*) for active state. */
  match?: (pathname: string) => boolean;
  /**
   * Surface this destination as a dedicated tab in the mobile bottom bar.
   * A phone bottom bar reads best with ~4 primary tabs plus a "More" menu, so
   * only the highest-traffic destinations are flagged; the rest fall into More.
   */
  mobile?: boolean;
};

export const primaryNav: NavItem[] = [
  {
    href: "/",
    labelKey: "home",
    icon: Home,
    match: (p) => p === "/",
    mobile: true,
  },
  {
    href: "/recipes",
    labelKey: "recipes",
    icon: BookOpen,
    // Exclude the create route so "Recipes" and "Create" never both read as
    // active on /recipes/new.
    match: (p) => p.startsWith("/recipes") && p !== "/recipes/new",
    mobile: true,
  },
  {
    href: "/discover",
    labelKey: "discover",
    icon: Compass,
    match: (p) => p.startsWith("/discover"),
  },
  {
    href: "/collections",
    labelKey: "saved",
    icon: Heart,
    match: (p) => p.startsWith("/collections"),
  },
  {
    href: "/plan",
    labelKey: "plan",
    icon: CalendarDays,
    match: (p) => p.startsWith("/plan"),
    mobile: true,
  },
  {
    href: "/journal",
    labelKey: "journal",
    icon: CookingPot,
    match: (p) => p.startsWith("/journal"),
  },
  {
    href: "/shopping",
    labelKey: "shopping",
    icon: ShoppingCart,
    match: (p) => p.startsWith("/shopping"),
    mobile: true,
  },
  {
    href: "/groups",
    labelKey: "family",
    icon: Users,
    match: (p) => p.startsWith("/groups"),
  },
  {
    href: "/recipes/new",
    labelKey: "create",
    icon: ChefHat,
    match: (p) => p === "/recipes/new",
  },
];

/** Destinations shown as dedicated tabs in the mobile bottom bar. */
export const mobilePrimaryNav: NavItem[] = primaryNav.filter(
  (item) => item.mobile,
);

/** Destinations that overflow into the mobile "More" menu. */
export const mobileMoreNav: NavItem[] = primaryNav.filter(
  (item) => !item.mobile,
);

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
