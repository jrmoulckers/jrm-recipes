import { type Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getCurrentUser } from '~/server/auth';
import { getGroupBySlug } from '~/server/groups/queries';
import { getModerationQueue } from '~/server/moderation/queries';
import { DomainError } from '~/server/errors';
import { ModerationQueue } from '~/components/groups/moderation-queue';
import { Button } from '~/components/ui/button';
import { parseSlugParams, type SlugRouteParams } from '~/lib/route-params';
import { withRouteMessages } from '~/components/i18n/route-messages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata');
  return { title: t('moderation.title') };
}

async function GroupModerationPage({ params }: { params: Promise<SlugRouteParams> }) {
  const { slug } = await parseSlugParams(params);
  const viewer = await getCurrentUser();
  const group = await getGroupBySlug(slug, viewer);
  if (!group) notFound();

  let queue;
  try {
    queue = await getModerationQueue(slug, viewer);
  } catch (error) {
    // Members / kids get a FORBIDDEN. Hide the page entirely rather than leak
    // that a moderation queue exists.
    if (error instanceof DomainError && error.code === 'FORBIDDEN') notFound();
    throw error;
  }
  if (!queue) notFound();

  const t = await getTranslations('groups.moderationPage');

  return (
    <div className="container max-w-3xl py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-muted-foreground">{t('description')}</p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/groups/${group.slug}`}>{t('backToGroup')}</Link>
        </Button>
      </div>
      <ModerationQueue queue={queue} />
    </div>
  );
}

export default withRouteMessages(GroupModerationPage);
