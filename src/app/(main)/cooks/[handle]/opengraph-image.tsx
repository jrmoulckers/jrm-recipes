import { ImageResponse } from "next/og";

import { getPublicProfileByHandle } from "~/server/users/queries";
import { displayNameFrom } from "~/lib/utils";
import { loadFonts, fetchCoverDataUri } from "../../recipes/[id]/_assets/og";
import { SIZE } from "../../recipes/[id]/_assets/card";
import { ProfileCard, type ProfileCardData } from "../../_og/social-card";

// Node runtime so it can reuse the pooled Postgres query and embed the avatar
// via Buffer. Rendered on demand (never at build time).
export const runtime = "nodejs";

export const alt = "A cook on Heirloom";
export const size = SIZE;
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;

  // Unknown handle (or DB off) => neutral brand card, never a data leak. Only
  // public profile data is embedded; the query never returns private recipes.
  let data: ProfileCardData | null = null;
  try {
    const profile = await getPublicProfileByHandle(handle);
    if (profile) {
      data = {
        name: displayNameFrom(profile.user.name, profile.user.handle, handle),
        handle: profile.user.handle ?? handle,
        avatar: await fetchCoverDataUri(profile.user.avatarUrl),
        recipeCount: profile.recipes.length,
      };
    }
  } catch {
    data = null;
  }

  const fonts = loadFonts();

  return new ImageResponse(<ProfileCard data={data} />, { ...size, fonts });
}
