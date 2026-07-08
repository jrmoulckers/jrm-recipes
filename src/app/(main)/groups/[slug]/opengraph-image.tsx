import { ImageResponse } from "next/og";

import { getGroupBySlug } from "~/server/groups/queries";
import { loadFonts, fetchCoverDataUri } from "../../recipes/[id]/_assets/og";
import { SIZE } from "../../recipes/[id]/_assets/card";
import { GroupCard, type GroupCardData } from "../../_og/social-card";

// Node runtime so it can reuse the pooled Postgres query and embed the avatar
// via Buffer. Rendered on demand (never at build time).
export const runtime = "nodejs";

export const alt = "A family cookbook on Heirloom";
export const size = SIZE;
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Resolve with a null viewer so only public-safe data is used: the recipe
  // count reflects public recipes only, and no member-only details are drawn.
  // Unknown slug (or DB off) => neutral brand card, never a data leak.
  let data: GroupCardData | null = null;
  try {
    const group = await getGroupBySlug(slug, null);
    if (group) {
      data = {
        name: group.name,
        avatar: await fetchCoverDataUri(group.avatarUrl),
        memberCount: group.members.length,
        recipeCount: group.recipes.length,
      };
    }
  } catch {
    data = null;
  }

  const fonts = loadFonts();

  return new ImageResponse(<GroupCard data={data} />, { ...size, fonts });
}
