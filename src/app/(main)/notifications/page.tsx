import { type Metadata } from 'next';
import { Bell } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { getCurrentUser, isAuthConfigured } from '~/server/auth';
import { isDbConfigured } from '~/server/db';
import { listNotifications } from '~/server/notifications/queries';
import { listPendingCreatorInvites } from '~/server/recipes/creators';
import { NotificationInbox } from '~/components/notifications/notification-inbox';
import { CreatorInviteList } from '~/components/recipe/creator-invite-list';
import { EmptyState } from '~/components/ui/empty-state';
import { withRouteMessages } from '~/components/i18n/route-messages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata');
  return { title: t('notifications.title') };
}

async function NotificationsPage() {
  const user = await getCurrentUser();
  const t = await getTranslations('notifications.page');
  const tInvites = await getTranslations('recipeCreators.invites');

  if (isAuthConfigured() && isDbConfigured() && !user) {
    return (
      <div className="container py-10">
        <EmptyState icon={<Bell />} title={t('signIn.title')} description={t('signIn.body')} />
      </div>
    );
  }

  const page = user
    ? await listNotifications(user.id, { limit: 20 })
    : { items: [], nextCursor: null };
  // Co-creator invitations live here rather than on the recipe (#668): a
  // pending invitee cannot see the recipe yet, so its page 404s for them. The
  // notification that brought them here is the only thing they can act on.
  const invites = user ? await listPendingCreatorInvites(user.id) : [];

  return (
    <div className="container flex flex-col gap-8 py-10">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t('description')}</p>
      </header>
      {invites.length > 0 ? (
        <section aria-labelledby="creator-invites-heading">
          <h2 id="creator-invites-heading" className="text-lg font-semibold text-foreground">
            {tInvites('title')}
          </h2>
          <div className="mt-3">
            <CreatorInviteList
              invites={invites.flatMap((invite) =>
                invite.recipe && !invite.recipe.deletedAt
                  ? [
                      {
                        recipeId: invite.recipeId,
                        title: invite.recipe.title,
                        ownerName: invite.recipe.author?.name ?? null,
                      },
                    ]
                  : [],
              )}
            />
          </div>
        </section>
      ) : null}
      <NotificationInbox initialItems={page.items} initialCursor={page.nextCursor} />
    </div>
  );
}

export default withRouteMessages(NotificationsPage);
