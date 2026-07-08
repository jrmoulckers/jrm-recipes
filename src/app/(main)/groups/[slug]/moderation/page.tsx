import { type Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentUser } from "~/server/auth";
import { getGroupBySlug } from "~/server/groups/queries";
import { getModerationQueue } from "~/server/moderation/queries";
import { DomainError } from "~/server/errors";
import { ModerationQueue } from "~/components/groups/moderation-queue";
import { Button } from "~/components/ui/button";
import { parseSlugParams, type SlugRouteParams } from "~/lib/route-params";

export const metadata: Metadata = { title: "Moderation" };

export default async function GroupModerationPage({
  params,
}: {
  params: Promise<SlugRouteParams>;
}) {
  const { slug } = await parseSlugParams(params);
  const viewer = await getCurrentUser();
  const group = await getGroupBySlug(slug, viewer);
  if (!group) notFound();

  let queue;
  try {
    queue = await getModerationQueue(slug, viewer);
  } catch (error) {
    // Members / kids get a FORBIDDEN — hide the page entirely rather than leak
    // that a moderation queue exists.
    if (error instanceof DomainError && error.code === "FORBIDDEN") notFound();
    throw error;
  }
  if (!queue) notFound();

  return (
    <div className="container max-w-3xl py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Moderation
          </h1>
          <p className="mt-1 text-muted-foreground">
            Reports from members of this family — hide anything that crosses a
            line, or dismiss reports that don&apos;t.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/groups/${group.slug}`}>Back to group</Link>
        </Button>
      </div>
      <ModerationQueue queue={queue} />
    </div>
  );
}
