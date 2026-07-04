import { cache } from "react";
import { type Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentUser } from "~/server/auth";
import {
  canManage as canManageGroup,
  getGroupBySlug,
} from "~/server/groups/queries";
import { GroupSettingsForm } from "~/components/groups/group-settings-form";
import { Button } from "~/components/ui/button";

const load = cache(async (slug: string) => {
  const viewer = await getCurrentUser();
  const group = await getGroupBySlug(slug, viewer);
  return { group };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { group } = await load(slug);
  if (!group) return { title: "Group settings" };
  return { title: `${group.name} settings` };
}

export default async function GroupSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { group } = await load(slug);
  if (!group || !canManageGroup(group.viewerRole)) notFound();

  return (
    <div className="container max-w-3xl py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Group settings
          </h1>
          <p className="mt-1 text-muted-foreground">
            Keep the name, note, and family photo current.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/groups/${group.slug}`}>Back to group</Link>
        </Button>
      </div>
      <GroupSettingsForm
        slug={group.slug}
        group={{
          name: group.name,
          description: group.description,
          avatarUrl: group.avatarUrl,
        }}
      />
    </div>
  );
}
