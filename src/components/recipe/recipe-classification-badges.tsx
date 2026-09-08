import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Globe2, Leaf, Utensils } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '~/lib/utils';
import { type CanonicalTag, type TagCategory } from '~/lib/tag-taxonomy';
import { type DietaryTag } from '~/lib/substitutions';
import { recipeClassificationHref } from '~/lib/recipe-classifications';
import { type DietaryAssessmentView } from '~/lib/dietary-presentation';

const RecipeDietaryAssessments = dynamic(() =>
  import('~/components/dietary/recipe-dietary-assessments').then(
    (module) => module.RecipeDietaryAssessments,
  ),
);

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
  dietaryAssessments = [],
  signedIn = false,
  canReviewDietary = false,
  linked = true,
  limit,
  className,
}: {
  items: ClassificationItem[];
  dietary?: DietaryTag[];
  dietaryAssessments?: DietaryAssessmentView[];
  signedIn?: boolean;
  canReviewDietary?: boolean;
  linked?: boolean;
  limit?: number;
  className?: string;
}) {
  const tNames = useTranslations('classificationNames');
  const deduped = new Map<string, ClassificationItem>();
  for (const item of items) {
    deduped.set(`${item.category}:${item.slug}`, item);
  }
  const visible = [...deduped.values()].slice(0, limit);
  if (visible.length === 0 && dietary.length === 0 && dietaryAssessments.length === 0) return null;

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
      <RecipeDietaryAssessments
        assessments={dietaryAssessments}
        declared={dietary}
        signedIn={signedIn}
        canReview={canReviewDietary}
      />
    </div>
  );
}
