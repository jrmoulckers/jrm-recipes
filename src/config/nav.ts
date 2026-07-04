import {
  BookOpen,
  ChefHat,
  Home,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
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
