import { buildRecipeOembed, recipeSlugFromUrl } from "~/lib/oembed";
import { getPublicRecipeCard } from "~/server/recipes/queries";

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
 * *public* recipe, or 404 for anything non-public / unknown — so the endpoint
 * never leaks private data and can't be pointed at arbitrary URLs. Only the
 * `json` format is supported; `xml` yields 501 per the spec.
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

  const slug = recipeSlugFromUrl(url);
  if (!slug) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const recipe = await getPublicRecipeCard(slug);
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
