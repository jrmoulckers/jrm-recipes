import { cache } from "react";
import { type Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getCurrentUser } from "~/server/auth";
import {
  canManage as canManageGroup,
  getGroupBySlug,
} from "~/server/groups/queries";
import { GroupSettingsForm } from "~/components/groups/group-settings-form";
import { Breadcrumbs } from "~/components/layout/breadcrumbs";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { parseSlugParams, type SlugRouteParams } from "~/lib/route-params";

/**
 * Plain-language capability hints for each group role, surfaced right where a
 * manager assigns them (issue #344). Copy only — the roles and rules themselves
 * live in the server (`src/server/groups/mutations.ts`) and are documented in
 * `docs/group-roles.md`.
 */
const ROLE_HINTS = [
  {
    role: "Owner",
    hint: "Full control — manage settings and members, assign admins, transfer ownership, or delete the group.",
  },
  {
    role: "Admin",
    hint: "Helps you run the group — edit settings, invite people, and manage members and kids (but can't add other admins).",
  },
  {
    role: "Member",
    hint: "A family member — reads the shared cookbook and adds recipes.",
  },
  {
    role: "Kid",
    hint: "A child account with the kid-safe experience. Always free — never uses a paid seat.",
  },
] as const;

const load = cache(async (slug: string) => {
  const viewer = await getCurrentUser();
  const group = await getGroupBySlug(slug, viewer);
  return { group };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<SlugRouteParams>;
}): Promise<Metadata> {
  const { slug } = await parseSlugParams(params);
  const { group } = await load(slug);
  if (!group) return { title: "Group settings" };
  return { title: `${group.name} settings` };
}

export default async function GroupSettingsPage({
  params,
}: {
  params: Promise<SlugRouteParams>;
}) {
  const { slug } = await parseSlugParams(params);
  const { group } = await load(slug);
  if (!group || !canManageGroup(group.viewerRole)) notFound();

  const tNav = await getTranslations("nav");

  return (
    <div className="container max-w-3xl py-10">
      <Breadcrumbs
        className="mb-4"
        items={[
          { label: tNav("family"), href: "/groups" },
          { label: group.name },
          { label: "Settings" },
        ]}
      />
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

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Roles &amp; permissions</CardTitle>
          <CardDescription>
            Who can do what in this group. You can set a member&apos;s role from
            the group page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2">
            {ROLE_HINTS.map(({ role, hint }) => (
              <div key={role}>
                <dt className="text-sm font-medium">{role}</dt>
                <dd className="mt-0.5 text-sm text-muted-foreground">{hint}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
