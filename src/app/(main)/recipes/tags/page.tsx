import { type Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Tags, TrendingUp } from "lucide-react";

import { getCurrentUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { listTagsWithCounts } from "~/server/recipes/queries";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";

export const metadata: Metadata = {
  title: "Browse tags",
  description: "Explore the family cookbook by tag.",
};

/** How many of the most-used tags to surface in the "Popular" strip. */
const POPULAR_TAG_COUNT = 12;

type TagCount = { slug: string; name: string; count: number };

export default async function TagsDirectoryPage() {
  const user = await getCurrentUser();
  const tags = isDbConfigured() ? await listTagsWithCounts(user) : [];

  const popular = [...tags]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, POPULAR_TAG_COUNT);
  const maxCount = popular[0]?.count ?? 0;

  return (
    <div className="container flex flex-col gap-8 py-10">
      <div className="flex flex-col gap-3">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="-ml-2 w-fit text-muted-foreground"
        >
          <Link href="/recipes">
            <ArrowLeft /> Back to recipes
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <Tags className="size-7 text-primary" />
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Browse tags
          </h1>
        </div>
        <p className="text-muted-foreground">
          {tags.length > 0
            ? "Every tag across the recipes you can see. Pick one to jump into a filtered view."
            : "Tags will appear here as recipes get tagged."}
        </p>
      </div>

      {tags.length === 0 ? (
        <EmptyTags />
      ) : (
        <>
          <section className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-5 text-primary" />
              <h2 className="font-display text-xl font-bold tracking-tight">
                Popular
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {popular.map((tag) => (
                <TagCloudLink key={tag.slug} tag={tag} maxCount={maxCount} />
              ))}
            </div>
          </section>

          <TagIndex tags={tags} />
        </>
      )}
    </div>
  );
}

/** A single tag chip whose weight scales with how many recipes carry it. */
function TagCloudLink({ tag, maxCount }: { tag: TagCount; maxCount: number }) {
  // Bucket into visual weights so a few huge tags don't dwarf the rest.
  const ratio = maxCount > 0 ? tag.count / maxCount : 0;
  const size = ratio > 0.66 ? "text-base font-semibold" : "text-sm";
  return (
    <Link
      href={`/recipes?tag=${encodeURIComponent(tag.slug)}`}
      className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 transition-colors hover:border-primary/40 hover:bg-accent"
    >
      <span className={`${size} text-foreground group-hover:text-primary`}>
        #{tag.name}
      </span>
      <Badge variant="muted" className="px-1.5 text-xs tabular-nums">
        {tag.count}
      </Badge>
    </Link>
  );
}

/** All tags grouped into an A-Z index. */
function TagIndex({ tags }: { tags: TagCount[] }) {
  const groups = new Map<string, TagCount[]>();
  for (const tag of tags) {
    const first = tag.name.charAt(0).toUpperCase();
    const key = /[A-Z]/.test(first) ? first : "#";
    const bucket = groups.get(key);
    if (bucket) bucket.push(tag);
    else groups.set(key, [tag]);
  }
  const letters = [...groups.keys()].sort();

  return (
    <section className="flex flex-col gap-6">
      <h2 className="font-display text-xl font-bold tracking-tight">
        All tags{" "}
        <span className="text-base font-normal text-muted-foreground">
          ({tags.length})
        </span>
      </h2>
      {letters.map((letter) => (
        <div key={letter} className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {letter}
          </h3>
          <div className="flex flex-wrap gap-2">
            {groups.get(letter)!.map((tag) => (
              <Link
                key={tag.slug}
                href={`/recipes?tag=${encodeURIComponent(tag.slug)}`}
                className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary/40 hover:bg-accent"
              >
                <span className="text-foreground group-hover:text-primary">
                  #{tag.name}
                </span>
                <Badge variant="muted" className="px-1.5 text-xs tabular-nums">
                  {tag.count}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function EmptyTags() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
      <Tags className="size-10 text-muted-foreground" />
      <p className="text-muted-foreground">No tags yet.</p>
      <Button asChild variant="outline">
        <Link href="/recipes">Browse recipes</Link>
      </Button>
    </div>
  );
}
