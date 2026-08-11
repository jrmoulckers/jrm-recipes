import { cache } from 'react';
import { type Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChefHat } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { getPublicProfileByHandle } from '~/server/users/queries';
import { getCurrentUser } from '~/server/auth';
import { getFollowCounts, isFollowing } from '~/server/follows/queries';
import { brand } from '~/config/brand';
import { absoluteUrl, displayNameFrom } from '~/lib/utils';
import { RecipeCard } from '~/components/recipe/recipe-card';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { FollowButton } from '~/components/follows/follow-button';
import { parseHandleParams, type HandleRouteParams } from '~/lib/route-params';
import { withRouteMessages } from '~/components/i18n/route-messages';

const load = cache((handle: string) => getPublicProfileByHandle(handle));

/** Two-letter initials for the avatar fallback (name, else handle). */
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<HandleRouteParams>;
}): Promise<Metadata> {
  const { handle } = await parseHandleParams(params);
  const profile = await load(handle);
  const t = await getTranslations('metadata');
  if (!profile) return { title: t('cookProfile.notFound'), robots: { index: false } };

  const displayName = displayNameFrom(profile.user.name, `@${profile.user.handle}`);
  const count = profile.recipes.length;
  const canonical = absoluteUrl(`/cooks/${profile.user.handle}`);
  const description = t('cookProfile.description', {
    count,
    name: displayName,
    brand: brand.name,
  });

  return {
    title: t('cookProfile.title', { name: displayName }),
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'profile',
      title: `${displayName} · ${brand.name}`,
      description,
      url: canonical,
    },
    twitter: { card: 'summary_large_image', title: displayName, description },
  };
}

async function CookProfilePage({ params }: { params: Promise<HandleRouteParams> }) {
  const { handle } = await parseHandleParams(params);
  const profile = await load(handle);
  if (!profile) notFound();

  const { user, recipes } = profile;
  const displayName = displayNameFrom(user.name, `@${user.handle}`);
  const count = recipes.length;

  // Follow affordance only exists when the profile owner has opted in to a
  // public profile. Otherwise there is no follow button and no counts. The
  // follow graph stays invisible for cooks who haven't opted in.
  const viewer = user.publicActivityOptIn ? await getCurrentUser() : null;
  const showFollow = user.publicActivityOptIn;
  const [counts, viewerFollows] = showFollow
    ? await Promise.all([
        getFollowCounts(user.id),
        viewer && viewer.id !== user.id ? isFollowing(viewer.id, user.id) : Promise.resolve(false),
      ])
    : [null, false];
  const isSelf = viewer?.id === user.id;
  const t = await getTranslations('cooks.profile');

  return (
    <div className="container flex flex-col gap-8 py-10">
      <header className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:text-start">
        <Avatar className="size-20 text-xl">
          {/* Decorative: the avatar repeats the display name in the h1 below. */}
          {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
          <AvatarFallback>{initials(displayNameFrom(user.name, user.handle, '?'))}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-bold tracking-tight">{displayName}</h1>
          <p className="text-muted-foreground">@{user.handle}</p>
          <p className="text-sm text-muted-foreground">{t('publicRecipeCount', { count })}</p>
          {showFollow && counts && (
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <Link
                href={`/cooks/${user.handle}/followers`}
                className="text-muted-foreground underline-offset-2 hover:underline"
              >
                {t.rich('followerCount', {
                  count: counts.followers,
                  strong: (chunks) => (
                    <span className="font-semibold text-foreground">{chunks}</span>
                  ),
                })}
              </Link>
              <Link
                href={`/cooks/${user.handle}/following`}
                className="text-muted-foreground underline-offset-2 hover:underline"
              >
                {t.rich('followingCount', {
                  count: counts.following,
                  strong: (chunks) => (
                    <span className="font-semibold text-foreground">{chunks}</span>
                  ),
                })}
              </Link>
            </div>
          )}
        </div>
        {showFollow && !isSelf && (
          <div className="sm:ms-auto">
            <FollowButton followeeId={user.id} initialFollowing={viewerFollows} />
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
            <h2 className="font-display text-xl font-semibold">{t('empty.title')}</h2>
            <p className="mt-1 max-w-sm text-muted-foreground">
              {t('empty.body', { name: displayName })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default withRouteMessages(CookProfilePage);
