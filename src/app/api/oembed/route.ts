import { buildRecipeOembed, recipeRefFromUrl } from "~/lib/oembed";
import { getPublicRecipeCard } from "~/server/recipes/queries";
import { resolveNamespacedRecipe } from "~/server/recipes/resolve";

// Reuses the pooled Postgres query, so keep it on the Node runtime. Always
// resolved per-request (a recipe can be unpublished/made private at any time).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function numberParam(value: string | null): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * oEmbed provider endpoint (issue #347): `/api/oembed?url=<recipe url>&format=json`.
 * Returns a `rich` payload (iframe `html`, thumbnail, brand attribution) for a
 * *public* recipe, or 404 for anything non-public / unknown. So the endpoint
 * never leaks private data and can't be pointed at arbitrary URLs. Only the
 * `json` format is supported. `xml` yields 501 per the spec.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const url = searchParams.get("url");
  if (!url) {
    return Response.json(
      { error: "Missing required 'url' parameter." },
      { status: 400 },
    );
  }

  const format = searchParams.get("format");
  if (format && format.toLowerCase() !== "json") {
    return Response.json(
      { error: "Only the json format is supported." },
      { status: 501 },
    );
  }

  const ref = recipeRefFromUrl(url);
  if (!ref) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  // A namespaced URL is resolved through the cook's namespace (which also
  // honours retained aliases); the legacy flat form falls through to the
  // id-or-slug lookup, which is deterministic for those older links.
  const lookup = ref.cook
    ? ((await resolveNamespacedRecipe(ref.cook, ref.recipe))?.recipeId ?? null)
    : ref.recipe;
  if (!lookup) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const recipe = await getPublicRecipeCard(lookup);
  if (!recipe) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const payload = buildRecipeOembed(recipe, {
    maxwidth: numberParam(searchParams.get("maxwidth")),
    maxheight: numberParam(searchParams.get("maxheight")),
  });

  return Response.json(payload, {
    headers: { "cache-control": "public, max-age=3600, s-maxage=3600" },
  });
}
