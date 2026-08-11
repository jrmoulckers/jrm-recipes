import { cache } from "react";
import { type Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  BookMarked,
  BookOpen,
  Plus,
  ShieldAlert,
  Settings,
  Users,
} from "lucide-react";

import { getCurrentUser } from "~/server/auth";
import {
  canManage as canManageGroup,
  getGroupBySlug,
  type GroupRecipe,
} from "~/server/groups/queries";
import { type SharedGroupCollection } from "~/server/collections/queries";
import { getOpenReportCount } from "~/server/moderation/queries";
import { getGroupActivity } from "~/server/activity/queries";
import { listCollectionsSharedWithGroup } from "~/server/collections/queries";
import {
  getRecentCookAlongsToLog,
  getUpcomingCookAlongs,
} from "~/server/cookalong/queries";
import { AddMemberForm } from "~/components/groups/add-member-form";
import { ActivityFeed } from "~/components/groups/activity-feed";
import { CookAlongSection } from "~/components/groups/cook-along-section";
import { GroupActions } from "~/components/groups/group-actions";
import { InviteLinkManager } from "~/components/groups/invite-link-manager";
import {
  MemberList,
  type MemberListMember,
} from "~/components/groups/member-list";
import { RoleBadge } from "~/components/groups/role-badge";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { CloudinaryImage } from "~/components/ui/cloudinary-image";
import { RecipeImage } from "~/components/recipe/recipe-image";
import { Breadcrumbs } from "~/components/layout/breadcrumbs";
import { Separator } from "~/components/ui/separator";
import { brand } from "~/config/brand";
import { absoluteUrl } from "~/lib/utils";
import { parseSlugParams, type SlugRouteParams } from "~/lib/route-params";
import { withRouteMessages } from "~/components/i18n/route-messages";

const load = cache(async (slug: string) => {
  const viewer = await getCurrentUser();
  const group = await getGroupBySlug(slug, viewer);
  return { viewer, group };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<SlugRouteParams>;
}): Promise<Metadata> {
  const { slug } = await parseSlugParams(params);
  const { group } = await load(slug);
  const tMeta = await getTranslations("metadata");
  if (!group) return { title: tMeta("group.notFound") };
  const canonical = absoluteUrl(`/groups/${group.slug}`);
  const description =
    group.description ?? tMeta("group.description", { brand: brand.name });
  const title = tMeta("group.title", { name: group.name });
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      title: `${title} · ${brand.name}`,
      description,
      url: canonical,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

async function GroupPage({ params }: { params: Promise<SlugRouteParams> }) {
  const { slug } = await parseSlugParams(params);
  const { viewer, group } = await load(slug);
  if (!group) notFound();

  const canManage = canManageGroup(group.viewerRole);
  const openReportCount = canManage
    ? await getOpenReportCount(group.id, group.viewerRole)
    : 0;
  const activity =
    group.viewerRole && viewer
      ? await getGroupActivity(group.id, {
          id: viewer.id,
          role: group.viewerRole,
        })
      : null;
  const isMember = Boolean(group.viewerRole);
  const [upcomingCookAlongs, cookAlongsToLog] =
    isMember && viewer
      ? await Promise.all([
          getUpcomingCookAlongs(group.id, viewer.id),
          getRecentCookAlongsToLog(group.id, viewer.id),
        ])
      : [[], []];
  const sharedCollections =
    isMember && viewer
      ? await listCollectionsSharedWithGroup(group.id, viewer)
      : [];
  const cookAlongRecipes = group.recipes.map((recipe) => ({
    id: recipe.id,
    title: recipe.title,
  }));
  const members = group.members.map<MemberListMember>((member) => ({
    id: member.id,
    userId: member.userId,
    role: member.role,
    joinedAt: member.createdAt.toISOString(),
    user: member.user,
  }));
  const tNav = await getTranslations("nav");
  const t = await getTranslations("groups.detail");
  const tCard = await getTranslations("groups.card");

  return (
    <div className="container flex flex-col gap-8 py-10">
      <Breadcrumbs
        items={[
          { label: tNav("family"), href: "/groups" },
          { label: group.name },
        ]}
      />
      <header className="rounded-2xl border border-border bg-card p-5 shadow-token sm:p-7">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-start">
            <div className="bg-primary/12 flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border font-display text-2xl font-bold text-primary">
              {/* Decorative: the avatar repeats the group name shown beside it. */}
              {group.avatarUrl ? (
                <Image
                  src={group.avatarUrl}
                  alt=""
                  width={80}
                  height={80}
                  className="size-full object-cover"
                />
              ) : (
                initials(group.name)
              )}
            </div>
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {group.viewerRole ? (
                  <RoleBadge role={group.viewerRole} />
                ) : (
                  <Badge variant="muted">{t("publicView")}</Badge>
                )}
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Users className="size-4" aria-hidden="true" />
                  {tCard("memberCount", { count: group.members.length })}
                </span>
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <BookOpen className="size-4" aria-hidden="true" />
                  {tCard("recipeCount", { count: group.recipes.length })}
                </span>
              </div>
              <h1 className="max-w-3xl font-display text-4xl font-bold leading-tight tracking-tight">
                {group.name}
              </h1>
              {group.description ? (
                <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
                  {group.description}
                </p>
              ) : (
                <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
                  {t("defaultDescription")}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {canManage ? (
              <Button asChild variant="outline">
                <Link href={`/groups/${group.slug}/moderation`}>
                  <ShieldAlert />
                  {t("moderation")}
                  {openReportCount > 0 ? (
                    <Badge variant="destructive" className="ms-1">
                      {openReportCount}
                    </Badge>
                  ) : null}
                </Link>
              </Button>
            ) : null}
            {canManage ? (
              <Button asChild variant="outline">
                <Link href={`/groups/${group.slug}/settings`}>
                  <Settings />
                  {t("settings")}
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <main className="flex min-w-0 flex-col gap-8">
          {activity ? (
            <section className="flex flex-col gap-4">
              <div>
                <h2 className="font-display text-2xl font-bold tracking-tight">
                  {t("activity.heading")}
                </h2>
                <p className="mt-1 text-muted-foreground">
                  {t("activity.body")}
                </p>
              </div>
              <ActivityFeed
                source={{ kind: "group", groupId: group.id }}
                initialEvents={activity.events}
                initialCursor={activity.nextCursor}
              />
            </section>
          ) : null}

          {activity ? <Separator /> : null}

          {isMember ? (
            <>
              <CookAlongSection
                groupSlug={group.slug}
                groupId={group.id}
                isMember={isMember}
                recipes={cookAlongRecipes}
                upcoming={upcomingCookAlongs}
                toLog={cookAlongsToLog}
              />
              <Separator />
            </>
          ) : null}

          <section className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-bold tracking-tight">
                  {t("members.heading")}
                </h2>
                <p className="mt-1 text-muted-foreground">
                  {t("members.body")}
                </p>
              </div>
              {canManage ? <InviteLinkManager slug={group.slug} /> : null}
            </div>
            {canManage ? <AddMemberForm slug={group.slug} /> : null}
            {isMember ? (
              <MemberList
                slug={group.slug}
                viewerRole={group.viewerRole}
                members={members}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-6 text-center text-muted-foreground">
                <p className="mx-auto max-w-md">
                  {t("members.privateNote", { count: group.members.length })}
                </p>
              </div>
            )}
          </section>

          <Separator />

          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-bold tracking-tight">
                  {t("cookbook.heading")}
                </h2>
                <p className="mt-1 text-muted-foreground">
                  {t("cookbook.body")}
                </p>
              </div>
              {group.viewerRole ? (
                <Button asChild variant="outline">
                  <Link href="/recipes/new">
                    <Plus />
                    {t("cookbook.addRecipe")}
                  </Link>
                </Button>
              ) : null}
            </div>

            {group.recipes.length > 0 ? (
              <div className="grid gap-5 sm:grid-cols-2">
                {group.recipes.map((recipe) => (
                  <GroupRecipeCard key={recipe.id} recipe={recipe} />
                ))}
              </div>
            ) : (
              <EmptyCookbook isMember={Boolean(group.viewerRole)} />
            )}
          </section>

          {isMember && sharedCollections.length > 0 ? (
            <>
              <Separator />
              <section className="flex flex-col gap-4">
                <div>
                  <h2 className="font-display text-2xl font-bold tracking-tight">
                    {t("shared.heading")}
                  </h2>
                  <p className="mt-1 text-muted-foreground">
                    {t("shared.body")}
                  </p>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  {sharedCollections.map((collection) => (
                    <SharedCollectionCard
                      key={collection.id}
                      collection={collection}
                      groupName={group.name}
                    />
                  ))}
                </div>
              </section>
            </>
          ) : null}
        </main>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-token">
            <h2 className="font-display text-xl font-semibold">
              {t("tools.heading")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {group.viewerRole ? t("tools.member") : t("tools.visitor")}
            </p>
            <div className="mt-4">
              <GroupActions
                slug={group.slug}
                groupName={group.name}
                viewerRole={group.viewerRole}
                isSoleOwner={
                  group.viewerRole === "owner" &&
                  group.members.filter((m) => m.role === "owner").length <= 1
                }
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

async function GroupRecipeCard({ recipe }: { recipe: GroupRecipe }) {
  const t = await getTranslations("groups.detail");
  return (
    <Link
      href={`/recipes/${recipe.slug}`}
      className="group overflow-hidden rounded-2xl border border-border bg-card shadow-token transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-token-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="bg-primary/12 relative aspect-[16/9] overflow-hidden">
        {/* Decorative: the cover sits directly above the recipe title, which
            names the enclosing link. */}
        <RecipeImage
          alt=""
          src={recipe.coverImageUrl}
          fallbackKey={recipe.id}
          fallbackContext={{
            title: recipe.title,
            cuisine: recipe.cuisine,
            tags: recipe.tags.map(({ tag }) => tag.name),
          }}
          fill
          sizes="(max-width: 640px) 100vw, 50vw"
          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <div className="absolute start-3 top-3 flex gap-2">
          {recipe.visibility !== "public" ? (
            <Badge variant="muted" className="capitalize backdrop-blur">
              {recipe.visibility}
            </Badge>
          ) : null}
          {recipe.status !== "published" ? (
            <Badge variant="outline" className="bg-card/90 capitalize">
              {recipe.status}
            </Badge>
          ) : null}
        </div>
      </div>
      <div className="p-4">
        <h3 className="line-clamp-1 font-display text-lg font-semibold leading-tight">
          {recipe.title}
        </h3>
        {recipe.description ? (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {recipe.description}
          </p>
        ) : null}
        {recipe.author?.name ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {t.rich("sharedBy", {
              name: recipe.author.name,
              author: (chunks) => (
                <span className="font-medium text-foreground">{chunks}</span>
              ),
            })}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

async function SharedCollectionCard({
  collection,
  groupName,
}: {
  collection: SharedGroupCollection;
  groupName: string;
}) {
  const tCard = await getTranslations("collections.card");
  return (
    <Link
      href={`/collections/${collection.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-token transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-token-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="bg-primary/12 relative aspect-[16/9] overflow-hidden">
        {/* Decorative: the cover sits directly above the collection name, which
            names the enclosing link. */}
        {collection.coverImageUrl ? (
          <CloudinaryImage
            src={collection.coverImageUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, 50vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-primary/25">
            <BookMarked className="size-10" />
          </div>
        )}
        <div className="absolute start-3 top-3">
          <Badge variant="muted" className="gap-1 backdrop-blur">
            <Users className="size-3" aria-hidden="true" />
            {tCard("sharedWith", { group: groupName })}
          </Badge>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="line-clamp-1 font-display text-lg font-semibold leading-tight">
          {collection.name}
        </h3>
        {collection.description ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {collection.description}
          </p>
        ) : null}
        <p className="mt-auto pt-2 text-xs text-muted-foreground">
          {collection.ownerName
            ? tCard("recipeCountByOwner", {
                count: collection.recipeCount,
                name: collection.ownerName,
              })
            : tCard("recipeCount", { count: collection.recipeCount })}
        </p>
      </div>
    </Link>
  );
}

async function EmptyCookbook({ isMember }: { isMember: boolean }) {
  const t = await getTranslations("groups.detail.empty");
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-8 text-center">
      <h3 className="font-display text-xl font-semibold">{t("title")}</h3>
      <p className="mx-auto mt-1 max-w-md text-muted-foreground">{t("body")}</p>
      {isMember ? (
        <Button asChild className="mt-4">
          <Link href="/recipes/new">
            <Plus />
            {t("cta")}
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

export default withRouteMessages(GroupPage);
