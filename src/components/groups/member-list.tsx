'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Crown, Settings, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { friendlyError } from '~/lib/error-copy';

import {
  removeMemberAction,
  transferOwnershipAction,
  updateMemberRoleAction,
} from '~/server/groups/actions';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { useConfirm } from '~/components/ui/confirm-dialog';
import { RoleBadge, type DisplayRole } from './role-badge';

type ManageableRole = Exclude<DisplayRole, 'owner'>;

export type MemberListMember = {
  id: string;
  userId: string;
  role: DisplayRole;
  joinedAt: string;
  user: {
    id: string;
    name: string | null;
    handle: string | null;
    avatarUrl: string | null;
  };
};

const MANAGEABLE_ROLES: ManageableRole[] = ['admin', 'member', 'kid'];

function initials(name: string | null, handle: string | null) {
  const source = name ?? handle ?? 'Cook';
  return source
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function displayName(member: MemberListMember, fallback: string) {
  return member.user.name ?? member.user.handle ?? fallback;
}

function canRemove(viewerRole: DisplayRole | null, member: MemberListMember) {
  if (member.role === 'owner') return false;
  if (viewerRole === 'owner') return true;
  if (viewerRole === 'admin') return member.role !== 'admin';
  return false;
}

export function MemberList({
  slug,
  viewerRole,
  members,
}: {
  slug: string;
  viewerRole: DisplayRole | null;
  members: MemberListMember[];
}) {
  const router = useRouter();
  const t = useTranslations('groups.members');
  const [pendingKey, setPendingKey] = React.useState<string | null>(null);
  const [openMenuUserId, setOpenMenuUserId] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const confirm = useConfirm();

  function runAction(
    key: string,
    action: () => Promise<{ ok: true; slug?: string } | { ok: false; error: string }>,
    successMessage: string,
  ) {
    setPendingKey(key);
    startTransition(() => {
      void action()
        .then((result) => {
          if (!result.ok) {
            toast.error(friendlyError(result.error));
            return;
          }
          toast.success(successMessage);
          router.refresh();
        })
        .finally(() => setPendingKey(null));
    });
  }

  async function confirmAfterDropdownCloses(options: Parameters<typeof confirm>[0]) {
    setOpenMenuUserId(null);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    return confirm(options);
  }

  return (
    <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {members.map((member) => {
        const name = displayName(member, t('fallbackMember'));
        const roleName = (role: ManageableRole) => t(`roles.${role}`);
        const canChangeRole = viewerRole === 'owner' && member.role !== 'owner';
        const canTransfer = viewerRole === 'owner' && member.role !== 'owner';
        const showActions = canChangeRole || canTransfer || canRemove(viewerRole, member);

        return (
          <div
            key={member.id}
            className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Avatar className="size-11">
                {member.user.avatarUrl ? (
                  <AvatarImage src={member.user.avatarUrl} alt={name} />
                ) : null}
                <AvatarFallback>{initials(member.user.name, member.user.handle)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-medium">{name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {member.user.handle ? `@${member.user.handle}` : t('noHandle')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:justify-end">
              <RoleBadge role={member.role} label={t(`roles.${member.role}`)} />
              {showActions ? (
                <DropdownMenu
                  open={openMenuUserId === member.userId}
                  onOpenChange={(open) => setOpenMenuUserId(open ? member.userId : null)}
                >
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t('a11y.manageMember', { name })}
                      disabled={isPending && pendingKey?.startsWith(member.userId)}
                    >
                      <Settings />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {canChangeRole ? (
                      <>
                        <DropdownMenuLabel>{t('changeRole')}</DropdownMenuLabel>
                        {MANAGEABLE_ROLES.map((role) => (
                          <DropdownMenuItem
                            key={role}
                            disabled={member.role === role}
                            onSelect={() =>
                              runAction(
                                `${member.userId}:role:${role}`,
                                () =>
                                  updateMemberRoleAction(slug, member.userId, {
                                    role,
                                  }),
                                t('toast.roleChanged', {
                                  name,
                                  role: roleName(role).toLowerCase(),
                                }),
                              )
                            }
                          >
                            {roleName(role)}
                          </DropdownMenuItem>
                        ))}
                      </>
                    ) : null}

                    {canTransfer ? (
                      <>
                        {canChangeRole ? <DropdownMenuSeparator /> : null}
                        <DropdownMenuItem
                          onSelect={async (event) => {
                            event.preventDefault();
                            const ok = await confirmAfterDropdownCloses({
                              title: t('confirm.transfer.title', { name }),
                              description: t('confirm.transfer.description'),
                              confirmLabel: t('confirm.transfer.confirmLabel'),
                              destructive: false,
                            });
                            if (!ok) return;
                            runAction(
                              `${member.userId}:owner`,
                              () =>
                                transferOwnershipAction(slug, {
                                  newOwnerUserId: member.userId,
                                }),
                              t('toast.ownershipTransferred', { name }),
                            );
                          }}
                        >
                          <Crown />
                          {t('transferOwnership')}
                        </DropdownMenuItem>
                      </>
                    ) : null}

                    {canRemove(viewerRole, member) ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={async (event) => {
                            event.preventDefault();
                            const ok = await confirmAfterDropdownCloses({
                              title: t('confirm.remove.title', { name }),
                              description: t('confirm.remove.description'),
                              confirmLabel: t('confirm.remove.confirmLabel'),
                            });
                            if (!ok) return;
                            runAction(
                              `${member.userId}:remove`,
                              () => removeMemberAction(slug, member.userId),
                              t('toast.removed', { name }),
                            );
                          }}
                        >
                          <Trash2 />
                          {t('removeFromGroup')}
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
