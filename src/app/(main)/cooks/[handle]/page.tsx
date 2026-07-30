import { cache } from "react";
import { type Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChefHat } from "lucide-react";

import { getPublicProfileByHandle } from "~/server/users/queries";
import { getCurrentUser } from "~/server/auth";
import { getFollowCounts, isFollowing } from "~/server/follows/queries";
import { brand } from "~/config/brand";
import { absoluteUrl, displayNameFrom } from "~/lib/utils";
import { RecipeCard } from "~/components/recipe/recipe-card";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { FollowButton } from "~/components/follows/follow-button";
import { parseHandleParams, type HandleRouteParams } from "~/lib/route-params";

const load = cache((handle: string) => getPublicProfileByHandle(handle));

/** Two-letter initials for the avatar fallback (name, else handle). */
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<HandleRouteParams>;
}): Promise<Metadata> {
  const { handle } = await parseHandleParams(params);
  const profile = await load(handle);
  if (!profile) return { title: "Cook not found", robots: { index: false } };

  const displayName = displayNameFrom(
    profile.user.name,
    `@${profile.user.handle}`,
  );
  const count = profile.recipes.length;
  const canonical = absoluteUrl(`/cooks/${profile.user.handle}`);
  const description = `${count} public recipe${count === 1 ? "" : "s"} by ${displayName} on ${brand.name}.`;

  return {
    title: `${displayName} · Recipes`,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      type: "profile",
      title: `${displayName} · ${brand.name}`,
      description,
      url: canonical,
    },
    twitter: { card: "summary_large_image", title: displayName, description },
  };
}

export default async function CookProfilePage({
  params,
}: {
  params: Promise<HandleRouteParams>;
}) {
  const { handle } = await parseHandleParams(params);
  const profile = await load(handle);
  if (!profile) notFound();

  const { user, recipes } = profile;
  const displayName = displayNameFrom(user.name, `@${user.handle}`);
  const count = recipes.length;

  // Follow affordance only exists when the profile owner has opted in to a
  // public profile. Otherwise there is no follow button and no counts — the
  // follow graph stays invisible for cooks who haven't opted in.
  const viewer = user.publicActivityOptIn ? await getCurrentUser() : null;
  const showFollow = user.publicActivityOptIn;
  const [counts, viewerFollows] = showFollow
    ? await Promise.all([
        getFollowCounts(user.id),
        viewer && viewer.id !== user.id
          ? isFollowing(viewer.id, user.id)
          : Promise.resolve(false),
      ])
    : [null, false];
  const isSelf = viewer?.id === user.id;

  return (
    <div className="container flex flex-col gap-8 py-10">
      <header className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:text-start">
        <Avatar className="size-20 text-xl">
          {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
          <AvatarFallback>
            {initials(displayNameFrom(user.name, user.handle, "?"))}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-bold tracking-tight">
            {displayName}
          </h1>
          <p className="text-muted-foreground">@{user.handle}</p>
          <p className="text-sm text-muted-foreground">
            {count} public recipe{count === 1 ? "" : "s"}
          </p>
          {showFollow && counts && (
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <Link
                href={`/cooks/${user.handle}/followers`}
                className="text-muted-foreground underline-offset-2 hover:underline"
              >
                <span className="font-semibold text-foreground">
                  {counts.followers}
                </span>{" "}
                follower{counts.followers === 1 ? "" : "s"}
              </Link>
              <Link
                href={`/cooks/${user.handle}/following`}
                className="text-muted-foreground underline-offset-2 hover:underline"
              >
                <span className="font-semibold text-foreground">
                  {counts.following}
                </span>{" "}
                following
              </Link>
            </div>
          )}
        </div>
        {showFollow && !isSelf && (
          <div className="sm:ms-auto">
            <FollowButton
              followeeId={user.id}
              initialFollowing={viewerFollows}
            />
          </div>
        )}
      </header>

      {count > 0 ? (
        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe, i) => (
            <RecipeCard key={recipe.id} recipe={recipe} priority={i < 3} />
          ))}
        </section>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-surface/50 py-16 text-center">
          <span className="inline-flex size-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <ChefHat className="size-7" />
          </span>
          <div>
            <h2 className="font-display text-xl font-semibold">
              No public recipes yet
            </h2>
            <p className="mt-1 max-w-sm text-muted-foreground">
              {displayName} hasn&apos;t shared any public recipes so far. Check
              back soon.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
