import { type Metadata } from "next";
import { notFound } from "next/navigation";

import { getCurrentUser } from "~/server/auth";
import { getSharedCollection } from "~/server/collections/queries";
import { getRecipe } from "~/server/recipes/queries";
import { toPrintRecipe } from "~/server/recipes/serialize";
import {
  CookbookPrintView,
  type CookbookPrintData,
} from "~/components/print/cookbook-print-view";
import type { PrintRecipe } from "~/components/print/types";
import { parseKeepsakeMessage } from "~/lib/keepsake";
import {
  parseCollectionParams,
  type CollectionRouteParams,
} from "~/lib/route-params";

type PrintSearchParams = { dedication?: string | string[] };

export async function generateMetadata({
  params,
}: {
  params: Promise<CollectionRouteParams>;
}): Promise<Metadata> {
  const { id } = await parseCollectionParams(params);
  const user = await getCurrentUser();
  const collection = await getSharedCollection(id, user);
  return {
    title: collection ? `Print · ${collection.name}` : "Print cookbook",
    robots: { index: false, follow: false },
  };
}

/**
 * Print a whole collection as one booklet (issue #397).
 *
 * Access is delegated to {@link getSharedCollection} (which enforces
 * collection-level visibility and drops any recipe the viewer can't see), and
 * each recipe's full detail is loaded through {@link getRecipe} — the same
 * visibility-checked path the recipe page uses — so a private recipe can never
 * leak into a shared cookbook. Rendering + page breaks are pure CSS, so the
 * browser's "Print → Save as PDF" is the only tool needed.
 */
export default async function CollectionPrintPage({
  params,
  searchParams,
}: {
  params: Promise<CollectionRouteParams>;
  searchParams: Promise<PrintSearchParams>;
}) {
  const { id } = await parseCollectionParams(params);
  const user = await getCurrentUser();
  const collection = await getSharedCollection(id, user);
  if (!collection) notFound();

  // Load each recipe's full detail in collection order. `getSharedCollection`
  // already filtered to viewable recipes; re-fetching through `getRecipe`
  // (which re-checks visibility) is belt-and-braces and yields the ingredients
  // and steps the card view omits. Runs in parallel — this is a rare, on-demand
  // action, never a hot path.
  const full = await Promise.all(
    collection.recipes.map((card) => getRecipe(card.id, user)),
  );
  const recipes: PrintRecipe[] = full
    .filter((recipe): recipe is NonNullable<typeof recipe> => recipe != null)
    .map(toPrintRecipe);

  const { note: dedication } = parseKeepsakeMessage({
    note: (await searchParams).dedication,
  });

  const data: CookbookPrintData = {
    id: collection.id,
    name: collection.name,
    description: collection.description,
    coverImageUrl: collection.coverImageUrl,
    ownerName: collection.ownerName,
    recipes,
  };

  return <CookbookPrintView collection={data} dedication={dedication} />;
}
