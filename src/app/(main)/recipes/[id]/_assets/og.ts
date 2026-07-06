import "server-only";

import type { FullRecipe } from "~/server/recipes/queries";
import type { CardData, CardDifficulty } from "./card";
import { fraunces600, nunito600, nunito800 } from "./fonts";

/**
 * Server-side helpers for the recipe share-card image: font loading, cover
 * embedding, and mapping a recipe row onto the card's data shape. Split from
 * the (satori) renderer so the JSX stays runtime-agnostic.
 */

export type OgFont = {
  name: string;
  data: Buffer;
  weight: 400 | 600 | 700 | 800;
  style: "normal";
};

let fonts: OgFont[] | null = null;

/** Decode and cache the embedded brand fonts (once per server instance). */
export function loadFonts(): OgFont[] {
  fonts ??= [
    {
      name: "Fraunces",
      data: Buffer.from(fraunces600, "base64"),
      weight: 600,
      style: "normal",
    },
    {
      name: "Nunito",
      data: Buffer.from(nunito600, "base64"),
      weight: 600,
      style: "normal",
    },
    {
      name: "Nunito",
      data: Buffer.from(nunito800, "base64"),
      weight: 800,
      style: "normal",
    },
  ];
  return fonts;
}

/** Ask Cloudinary for a right-sized, optimized cover; no-op for other hosts. */
function optimizeCoverUrl(url: string): string {
  if (!url.includes("res.cloudinary.com") || !url.includes("/upload/")) {
    return url;
  }
  return url.replace(
    "/upload/",
    "/upload/f_jpg,q_auto,w_1200,h_630,c_fill,g_auto/",
  );
}

/**
 * Fetch the cover and return it as a base64 data URI so satori embeds bytes
 * instead of doing its own (failure-prone) network fetch. Returns null on any
 * problem, letting the card fall back to its no-cover layout.
 */
export async function fetchCoverDataUri(
  coverImageUrl: string | null | undefined,
): Promise<string | null> {
  if (!coverImageUrl) return null;
  try {
    const res = await fetch(optimizeCoverUrl(coverImageUrl), {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // Guard against absurdly large downloads (~8 MB cap).
    if (buf.byteLength > 8_000_000) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

const DIFFICULTIES: CardDifficulty[] = ["easy", "medium", "hard"];

function asDifficulty(value: unknown): CardDifficulty | null {
  return DIFFICULTIES.includes(value as CardDifficulty)
    ? (value as CardDifficulty)
    : null;
}

/** Map a full recipe to card data, embedding an optimized cover image. */
export async function mapRecipeToCard(recipe: FullRecipe): Promise<CardData> {
  const total =
    recipe.totalMinutes ??
    ((recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0) || null);

  return {
    title: recipe.title,
    description: recipe.description,
    cover: await fetchCoverDataUri(recipe.coverImageUrl),
    author: recipe.author?.name ?? null,
    group: recipe.group?.name ?? null,
    totalMinutes: total,
    servings: recipe.servings,
    servingsNoun: recipe.servingsNoun,
    difficulty: asDifficulty(recipe.difficulty),
    cuisine: recipe.cuisine,
  };
}
