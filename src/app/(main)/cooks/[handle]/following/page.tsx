import { type Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { getPublicProfileByHandle } from "~/server/users/queries";
import { listFollowing } from "~/server/follows/queries";
import { displayNameFrom } from "~/lib/utils";
import { FollowPeopleList } from "~/components/follows/follow-people-list";
import { parseHandleParams, type HandleRouteParams } from "~/lib/route-params";

export async function generateMetadata({
  params,
}: {
  params: Promise<HandleRouteParams>;
}): Promise<Metadata> {
  const { handle } = await parseHandleParams(params);
  const profile = await getPublicProfileByHandle(handle);
  const t = await getTranslations("metadata");
  const displayName = profile
    ? displayNameFrom(profile.user.name, `@${profile.user.handle}`)
    : `@${handle}`;
  return {
    title: t("following.title", { handle }),
    description: t("following.description", { name: displayName }),
    robots: { index: false },
  };
}

export default async function FollowingPage({
  params,
}: {
  params: Promise<HandleRouteParams>;
}) {
  const { handle } = await parseHandleParams(params);
  const profile = await getPublicProfileByHandle(handle);
  // No follow graph exists for cooks who haven't opted in to a public profile.
  if (!profile?.user.publicActivityOptIn) notFound();

  const { user } = profile;
  const displayName = displayNameFrom(user.name, `@${user.handle}`);
  const first = await listFollowing(user.id);
  const t = await getTranslations("cooks.following");

  return (
    <div className="container flex max-w-2xl flex-col gap-6 py-10">
      <header className="flex flex-col gap-2">
        <Link
          href={`/cooks/${user.handle}`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          <ArrowLeft className="size-4" /> {displayName}
        </Link>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {t("title")}
        </h1>
      </header>
      <FollowPeopleList
        userId={user.id}
        direction="following"
        initialPeople={first.people}
        initialCursor={first.nextCursor}
        emptyLabel={t("empty", { name: displayName })}
      />
    </div>
  );
}
