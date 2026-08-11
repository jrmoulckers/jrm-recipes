import { cache } from 'react';
import { type Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getCurrentUser } from '~/server/auth';
import { canManage as canManageGroup, getGroupBySlug } from '~/server/groups/queries';
import { GroupSettingsForm } from '~/components/groups/group-settings-form';
import { Breadcrumbs } from '~/components/layout/breadcrumbs';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { parseSlugParams, type SlugRouteParams } from '~/lib/route-params';
import { withRouteMessages } from '~/components/i18n/route-messages';

/**
 * Plain-language capability hints for each group role, surfaced right where a
 * manager assigns them (issue #344). The role ids are structural. Their labels
 * and hints live in the `groups.settingsPage.roles.*` catalog entries, so the
 * copy is translated like the rest of the page. The roles and rules themselves
 * live in the server (`src/server/groups/mutations.ts`) and are documented in
 * `docs/group-roles.md`.
 */
const ROLE_KEYS = ['owner', 'admin', 'member', 'kid'] as const;

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
  const t = await getTranslations('metadata');
  if (!group) return { title: t('groupSettings.title') };
  return { title: t('groupSettings.named', { name: group.name }) };
}

async function GroupSettingsPage({ params }: { params: Promise<SlugRouteParams> }) {
  const { slug } = await parseSlugParams(params);
  const { group } = await load(slug);
  if (!group || !canManageGroup(group.viewerRole)) notFound();

  const tNav = await getTranslations('nav');
  const t = await getTranslations('groups.settingsPage');

  return (
    <div className="container max-w-3xl py-10">
      <Breadcrumbs
        className="mb-4"
        items={[
          { label: tNav('family'), href: '/groups' },
          { label: group.name },
          { label: t('breadcrumb') },
        ]}
      />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-muted-foreground">{t('description')}</p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/groups/${group.slug}`}>{t('backToGroup')}</Link>
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
          <CardTitle>{t('rolesHeading')}</CardTitle>
          <CardDescription>{t('rolesDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2">
            {ROLE_KEYS.map((role) => (
              <div key={role}>
                <dt className="text-sm font-medium">{t(`roles.${role}.label`)}</dt>
                <dd className="mt-0.5 text-sm text-muted-foreground">{t(`roles.${role}.hint`)}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

export default withRouteMessages(GroupSettingsPage);
