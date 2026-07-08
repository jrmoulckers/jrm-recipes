import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge doesn't know about the tokenized type scale (issue #98), so it
 * would misclassify `text-h1`, `text-body`, `text-body-sm`, … as text *colors*
 * and drop them when they sit next to a real `text-<color>` utility. Register
 * them in the `font-size` group so size, colour, and `text-wrap` stay
 * independent and all survive a merge.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display",
            "h1",
            "h2",
            "h3",
            "h4",
            "body",
            "body-lg",
            "body-sm",
          ],
        },
      ],
    },
  },
});

/** Merge conditional class names and resolve Tailwind conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Absolute URL helper for share links / metadata. */
export function absoluteUrl(path = "") {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    (typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:3000");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Pretty, human-friendly time from minutes (e.g. 90 -> "1 hr 30 min"). */
export function formatMinutes(total?: number | null): string {
  if (!total || total <= 0) return "—";
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  const parts: string[] = [];
  if (hours) parts.push(`${hours} hr`);
  if (mins) parts.push(`${mins} min`);
  return parts.join(" ");
}

/** Deterministic slug from a title (share-friendly). */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
