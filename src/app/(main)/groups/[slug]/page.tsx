import { cache } from "react";
import { type Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, Settings, Users } from "lucide-react";

import { getCurrentUser } from "~/server/auth";
import {
  canManage as canManageGroup,
  getGroupBySlug,
  type GroupRecipe,
} from "~/server/groups/queries";
import { AddMemberForm } from "~/components/groups/add-member-form";
import { GroupActions } from "~/components/groups/group-actions";
import { InviteLinkManager } from "~/components/groups/invite-link-manager";
import {
  MemberList,
  type MemberListMember,
} from "~/components/groups/member-list";
import { RoleBadge } from "~/components/groups/role-badge";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { brand } from "~/config/brand";
import { absoluteUrl } from "~/lib/utils";

const load = cache(async (slug: string) => {
  const viewer = await getCurrentUser();
  const group = await getGroupBySlug(slug, viewer);
  return { viewer, group };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { group } = await load(slug);
  if (!group) return { title: "Group not found" };
  const canonical = absoluteUrl(`/groups/${group.slug}`);
  const description =
    group.description ??
    `A shared family cookbook on ${brand.name}.`;
  return {
    title: group.name,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      title: `${group.name} · ${brand.name}`,
      description,
      url: canonical,
    },
    twitter: {
      card: "summary_large_image",
      title: group.name,
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

export default async function GroupPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { group } = await load(slug);
  if (!group) notFound();

  const canManage = canManageGroup(group.viewerRole);
  const members = group.members.map<MemberListMember>((member) => ({
    id: member.id,
    userId: member.userId,
    role: member.role,
    joinedAt: member.createdAt.toISOString(),
    user: member.user,
  }));

  return (
    <div className="container flex flex-col gap-8 py-10">
      <header className="rounded-2xl border border-border bg-card p-5 shadow-token sm:p-7">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-start">
            <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-primary/12 font-display text-2xl font-bold text-primary">
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
                  <Badge variant="muted">Public view</Badge>
                )}
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Users className="size-4" aria-hidden="true" />
                  {group.members.length}{" "}
                  {group.members.length === 1 ? "member" : "members"}
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
                  A shared family cookbook for recipes, notes, and memories.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {canManage ? (
              <Button asChild variant="outline">
                <Link href={`/groups/${group.slug}/settings`}>
                  <Settings />
                  Settings
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <main className="flex min-w-0 flex-col gap-8">
          <section className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-bold tracking-tight">
                  Members
                </h2>
                <p className="mt-1 text-muted-foreground">
                  The cooks and keepers gathered around this table.
                </p>
              </div>
              {canManage ? <InviteLinkManager slug={group.slug} /> : null}
            </div>
            {canManage ? <AddMemberForm slug={group.slug} /> : null}
            <MemberList
              slug={group.slug}
              viewerRole={group.viewerRole}
              members={members}
            />
          </section>

          <Separator />

          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-bold tracking-tight">
                  Group cookbook
                </h2>
                <p className="mt-1 text-muted-foreground">
                  Recipes saved for this family circle.
                </p>
              </div>
              {group.viewerRole ? (
                <Button asChild variant="outline">
                  <Link href="/recipes/new">
                    <Plus />
                    Add recipe
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
        </main>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-token">
            <h2 className="font-display text-xl font-semibold">Family tools</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {group.viewerRole
                ? "Manage your place at this table. Owners can delete the group; recipes stay in each cook's collection."
                : "Only invited members can add recipes or manage this family table."}
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

function GroupRecipeCard({ recipe }: { recipe: GroupRecipe }) {
  return (
    <Link
      href={`/recipes/${recipe.slug}`}
      className="group overflow-hidden rounded-2xl border border-border bg-card shadow-token transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-token-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-primary/12">
        {recipe.coverImageUrl ? (
          <Image
            src={recipe.coverImageUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, 50vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-4xl">
            🍲
          </div>
        )}
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
            Shared by{" "}
            <span className="font-medium text-foreground">{recipe.author.name}</span>
          </p>
        ) : null}
      </div>
    </Link>
  );
}

function EmptyCookbook({ isMember }: { isMember: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-8 text-center">
      <h3 className="font-display text-xl font-semibold">
        No recipes on this shelf yet
      </h3>
      <p className="mx-auto mt-1 max-w-md text-muted-foreground">
        Save the dish everyone asks for, then share it with this group.
      </p>
      {isMember ? (
        <Button asChild className="mt-4">
          <Link href="/recipes/new">
            <Plus />
            Add the first recipe
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
