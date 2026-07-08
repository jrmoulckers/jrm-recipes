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

export type NavItem = {
  href: Route;
  label: string;
  icon: LucideIcon;
  /** Match nested routes (e.g. /recipes/*) for active state. */
  match?: (pathname: string) => boolean;
};

export const primaryNav: NavItem[] = [
  { href: "/", label: "Home", icon: Home, match: (p) => p === "/" },
  {
    href: "/recipes",
    label: "Recipes",
    icon: BookOpen,
    match: (p) => p.startsWith("/recipes"),
  },
  {
    href: "/discover",
    label: "Discover",
    icon: Compass,
    match: (p) => p.startsWith("/discover"),
  },
  {
    href: "/collections",
    label: "Saved",
    icon: Heart,
    match: (p) => p.startsWith("/collections"),
  },
  {
    href: "/plan",
    label: "Plan",
    icon: CalendarDays,
    match: (p) => p.startsWith("/plan"),
  },
  {
    href: "/journal",
    label: "Journal",
    icon: CookingPot,
    match: (p) => p.startsWith("/journal"),
  },
  {
    href: "/shopping",
    label: "Shopping",
    icon: ShoppingCart,
    match: (p) => p.startsWith("/shopping"),
  },
  {
    href: "/groups",
    label: "Family",
    icon: Users,
    match: (p) => p.startsWith("/groups"),
  },
  {
    href: "/recipes/new",
    label: "Create",
    icon: ChefHat,
    match: (p) => p === "/recipes/new",
  },
];

/** A marketing/informational link surfaced in the site footer. */
export type FooterNavItem = {
  href: Route;
  /** Key into the `footer` message namespace (see src/messages/*.json). */
  labelKey: "pricing";
};

/**
 * Secondary links shown in the footer (issue #312). Kept here so the pricing
 * surface has a single source of truth for its route; labels stay localized via
 * the `footer` message namespace.
 */
export const footerNav: FooterNavItem[] = [
  { href: "/pricing", labelKey: "pricing" },
];
