import { type Metadata } from 'next';
import Link from 'next/link';
import { CalendarX2, Link2Off, Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { getCurrentUser, isAuthConfigured } from '~/server/auth';
import { isDbConfigured } from '~/server/db';
import { getInviteLinkPreview, type InviteLinkStatus } from '~/server/groups/queries';
import { JoinGroupPanel } from '~/components/groups/join-group-panel';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { Button } from '~/components/ui/button';
import { brand } from '~/config/brand';
import { parseTokenParams, type TokenRouteParams } from '~/lib/route-params';
import { withRouteMessages } from '~/components/i18n/route-messages';

// Invite links are private, single-purpose URLs. Never index them.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata');
  return {
    title: t('join.title'),
    description: t('join.description'),
    robots: { index: false, follow: false },
  };
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="container flex min-h-[70vh] items-center justify-center py-16">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-token">
        {children}
      </div>
    </div>
  );
}

async function StatusCard({ status }: { status: Exclude<InviteLinkStatus, 'active'> }) {
  const t = await getTranslations('groups.joinPage');
  const Icon = status === 'expired' ? CalendarX2 : Link2Off;
  return (
    <Shell>
      <span className="mx-auto inline-flex size-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Icon className="size-7" aria-hidden="true" />
      </span>
      <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">
        {t(`status.${status}.title`)}
      </h1>
      <p className="mt-2 text-muted-foreground">{t(`status.${status}.body`)}</p>
      <Button asChild variant="outline" className="mt-6">
        <Link href="/">{t('backHome', { brand: brand.name })}</Link>
      </Button>
    </Shell>
  );
}

async function JoinPage({ params }: { params: Promise<TokenRouteParams> }) {
  const { token } = await parseTokenParams(params);
  const t = await getTranslations('groups.joinPage');
  const tCard = await getTranslations('groups.card');

  const preview = isDbConfigured() ? await getInviteLinkPreview(token) : null;

  if (!preview) {
    return (
      <Shell>
        <span className="mx-auto inline-flex size-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Link2Off className="size-7" aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">
          {t('invalid.title')}
        </h1>
        <p className="mt-2 text-muted-foreground">{t('invalid.body')}</p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/">{t('backHome', { brand: brand.name })}</Link>
        </Button>
      </Shell>
    );
  }

  if (preview.status !== 'active') {
    return <StatusCard status={preview.status} />;
  }

  const [user, authConfigured] = [await getCurrentUser(), isAuthConfigured()];
  const { group, memberCount } = preview;

  return (
    <Shell>
      <Avatar className="mx-auto size-20">
        {group.avatarUrl ? <AvatarImage src={group.avatarUrl} alt={group.name} /> : null}
        <AvatarFallback className="text-xl">{initials(group.name)}</AvatarFallback>
      </Avatar>
      <p className="mt-4 text-sm font-medium text-primary">{t('invitedTo')}</p>
      <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">{group.name}</h1>
      {group.description ? (
        <p className="mt-2 text-muted-foreground">{group.description}</p>
      ) : (
        <p className="mt-2 text-muted-foreground">
          {t('defaultDescription', { brand: brand.name })}
        </p>
      )}
      <p className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <Users className="size-4" aria-hidden="true" />
        {tCard('memberCount', { count: memberCount })}
      </p>

      <div className="mt-6">
        <JoinGroupPanel
          token={preview.token}
          groupName={group.name}
          signedIn={Boolean(user)}
          authConfigured={authConfigured}
        />
      </div>
    </Shell>
  );
}

export default withRouteMessages(JoinPage);
