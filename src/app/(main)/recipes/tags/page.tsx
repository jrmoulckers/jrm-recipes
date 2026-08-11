import { type Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ChefHat,
  Globe2,
  Leaf,
  Tags,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { getCurrentUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { listTagsWithCounts } from "~/server/recipes/queries";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { TAG_CATEGORIES, type TagCategory } from "~/lib/tag-taxonomy";
import { recipeClassificationHref } from "~/lib/recipe-classifications";
import { withRouteMessages } from "~/components/i18n/route-messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: t("tags.title"),
    description: t("tags.description"),
  };
}

/** How many of the most-used tags to surface in the "Popular" strip. */
const POPULAR_TAG_COUNT = 12;

type TagCount = {
  slug: string;
  name: string;
  category: TagCategory;
  count: number;
};

async function TagsDirectoryPage() {
  const user = await getCurrentUser();
  const tags = isDbConfigured() ? await listTagsWithCounts(user) : [];
  const t = await getTranslations("recipe.tags");
  const tNames = await getTranslations("classificationNames");

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
          className="-ms-2 w-fit text-muted-foreground"
        >
          <Link href="/recipes">
            <ArrowLeft /> {t("backToRecipes")}
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <Tags className="size-7 text-primary" />
          <h1 className="font-display text-3xl font-bold tracking-tight">
            {t("title")}
          </h1>
        </div>
        <p className="text-muted-foreground">
          {tags.length > 0 ? t("intro") : t("introEmpty")}
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
                {t("popular")}
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {popular.map((tag) => (
                <TagCloudLink
                  key={tag.slug}
                  tag={tag}
                  label={tNames.has(tag.slug) ? tNames(tag.slug) : tag.name}
                  maxCount={maxCount}
                />
              ))}
            </div>
          </section>

          <ClassificationIndex tags={tags} />
        </>
      )}
    </div>
  );
}

/** A single tag chip whose weight scales with how many recipes carry it. */
function TagCloudLink({
  tag,
  label,
  maxCount,
}: {
  tag: TagCount;
  label: string;
  maxCount: number;
}) {
  // Bucket into visual weights so a few huge tags don't dwarf the rest.
  const ratio = maxCount > 0 ? tag.count / maxCount : 0;
  const size = ratio > 0.66 ? "text-base font-semibold" : "text-sm";
  return (
    <Link
      href={recipeClassificationHref(tag)}
      className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 transition-colors hover:border-primary/40 hover:bg-accent"
    >
      <span className={`${size} text-foreground group-hover:text-primary`}>
        {tag.category === "general" ? `#${label}` : label}
      </span>
      <Badge variant="muted" className="px-1.5 text-xs tabular-nums">
        {tag.count}
      </Badge>
    </Link>
  );
}

const CATEGORY_ICON: Record<TagCategory, LucideIcon> = {
  meal: ChefHat,
  cuisine: Globe2,
  dietary: Leaf,
  general: Tags,
};

/** All classifications grouped by their functional category. */
async function ClassificationIndex({ tags }: { tags: TagCount[] }) {
  const t = await getTranslations("recipe.tags");
  const tNames = await getTranslations("classificationNames");
  const groups = new Map<TagCategory, TagCount[]>();
  for (const tag of tags) {
    const bucket = groups.get(tag.category);
    if (bucket) bucket.push(tag);
    else groups.set(tag.category, [tag]);
  }

  return (
    <section className="flex flex-col gap-6">
      <h2 className="font-display text-xl font-bold tracking-tight">
        {t("allTags")}{" "}
        <span className="text-base font-normal text-muted-foreground">
          ({tags.length})
        </span>
      </h2>
      {TAG_CATEGORIES.filter((category) => groups.has(category)).map(
        (category) => {
          const Icon = CATEGORY_ICON[category];
          const values = groups.get(category)!;
          return (
            <div key={category} className="flex flex-col gap-3">
              <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
                <Icon className="size-4 text-primary" aria-hidden="true" />
                {t(`category.${category}`)}
                <span className="font-sans text-sm font-normal text-muted-foreground">
                  ({values.length})
                </span>
              </h3>
              <div className="flex flex-wrap gap-2">
                {values.map((tag) => (
                  <Link
                    key={tag.slug}
                    href={recipeClassificationHref(tag)}
                    className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary/40 hover:bg-accent"
                  >
                    <span className="text-foreground group-hover:text-primary">
                      {tag.category === "general"
                        ? `#${
                            tNames.has(tag.slug) ? tNames(tag.slug) : tag.name
                          }`
                        : tNames.has(tag.slug)
                          ? tNames(tag.slug)
                          : tag.name}
                    </span>
                    <Badge
                      variant="muted"
                      className="px-1.5 text-xs tabular-nums"
                    >
                      {tag.count}
                    </Badge>
                  </Link>
                ))}
              </div>
            </div>
          );
        },
      )}
    </section>
  );
}

async function EmptyTags() {
  const t = await getTranslations("recipe.tags");
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
      <Tags className="size-10 text-muted-foreground" />
      <p className="text-muted-foreground">{t("empty")}</p>
      <Button asChild variant="outline">
        <Link href="/recipes">{t("browseRecipes")}</Link>
      </Button>
    </div>
  );
}

export default withRouteMessages(TagsDirectoryPage);
