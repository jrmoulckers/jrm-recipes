import Link from 'next/link';
import { Globe2, Leaf, Utensils } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '~/lib/utils';
import { type CanonicalTag, type TagCategory } from '~/lib/tag-taxonomy';
import { DIETARY_TAG_LABELS, type DietaryTag } from '~/lib/substitutions';
import { recipeClassificationHref } from '~/lib/recipe-classifications';

type ClassificationItem = Pick<CanonicalTag, 'slug' | 'name' | 'category'> & {
  trustedDietary?: boolean;
};

const categoryClass: Record<TagCategory, string> = {
  meal: 'border-transparent bg-primary/12 text-[color:var(--badge-ink-primary)]',
  cuisine: 'border-transparent bg-secondary/15 text-foreground',
  dietary: 'border-transparent bg-success/15 text-[color:var(--badge-ink-success)]',
  general: 'border-border bg-muted text-muted-foreground',
};

function ClassificationIcon({ category }: { category: TagCategory }) {
  if (category === 'meal') return <Utensils className="size-3" aria-hidden="true" />;
  if (category === 'cuisine') return <Globe2 className="size-3" aria-hidden="true" />;
  if (category === 'dietary') return <Leaf className="size-3" aria-hidden="true" />;
  return <span aria-hidden="true">#</span>;
}

export function RecipeClassificationBadges({
  items,
  dietary = [],
  linked = true,
  limit,
  className,
}: {
  items: ClassificationItem[];
  dietary?: DietaryTag[];
  linked?: boolean;
  limit?: number;
  className?: string;
}) {
  const tNames = useTranslations('classificationNames');
  const declared = dietary.map((slug): ClassificationItem => ({
    slug,
    name: DIETARY_TAG_LABELS[slug],
    category: 'dietary',
    trustedDietary: true,
  }));
  const deduped = new Map<string, ClassificationItem>();
  for (const item of [...items, ...declared]) {
    deduped.set(`${item.category}:${item.slug}`, item);
  }
  const visible = [...deduped.values()].slice(0, limit);
  if (visible.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {visible.map((item) => {
        const label = tNames.has(item.slug) ? tNames(item.slug) : item.name;
        const content = (
          <>
            <ClassificationIcon category={item.category} />
            {label}
          </>
        );
        const styles = cn(
          'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium',
          categoryClass[item.category],
          linked &&
            'transition-colors hover:border-primary/45 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        );
        return linked ? (
          <Link
            key={`${item.category}:${item.slug}`}
            href={recipeClassificationHref(item, {
              trustedDietary: item.trustedDietary,
            })}
            className={styles}
          >
            {content}
          </Link>
        ) : (
          <span key={`${item.category}:${item.slug}`} className={styles}>
            {content}
          </span>
        );
      })}
    </div>
  );
}
