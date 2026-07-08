"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Crown, Settings, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "~/lib/error-copy";

import {
  removeMemberAction,
  transferOwnershipAction,
  updateMemberRoleAction,
} from "~/server/groups/actions";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { RoleBadge, roleLabel, type DisplayRole } from "./role-badge";

type ManageableRole = Exclude<DisplayRole, "owner">;

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

const MANAGEABLE_ROLES: ManageableRole[] = ["admin", "member", "kid"];

function initials(name: string | null, handle: string | null) {
  const source = name ?? handle ?? "Cook";
  return source
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function displayName(member: MemberListMember) {
  return member.user.name ?? member.user.handle ?? "Family cook";
}

function canRemove(viewerRole: DisplayRole | null, member: MemberListMember) {
  if (member.role === "owner") return false;
  if (viewerRole === "owner") return true;
  if (viewerRole === "admin") return member.role !== "admin";
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
  const [pendingKey, setPendingKey] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

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

  return (
    <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {members.map((member) => {
        const name = displayName(member);
        const canChangeRole = viewerRole === "owner" && member.role !== "owner";
        const canTransfer = viewerRole === "owner" && member.role !== "owner";
        const showActions =
          canChangeRole || canTransfer || canRemove(viewerRole, member);

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
                <AvatarFallback>
                  {initials(member.user.name, member.user.handle)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-medium">{name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {member.user.handle ? `@${member.user.handle}` : "No handle yet"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:justify-end">
              <RoleBadge role={member.role} />
              {showActions ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Manage ${name}`}
                      disabled={isPending && pendingKey?.startsWith(member.userId)}
                    >
                      <Settings />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {canChangeRole ? (
                      <>
                        <DropdownMenuLabel>Change role</DropdownMenuLabel>
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
                                `${name} is now ${roleLabel(role).toLowerCase()}`,
                              )
                            }
                          >
                            {roleLabel(role)}
                          </DropdownMenuItem>
                        ))}
                      </>
                    ) : null}

                    {canTransfer ? (
                      <>
                        {canChangeRole ? <DropdownMenuSeparator /> : null}
                        <DropdownMenuItem
                          onSelect={() => {
                            if (
                              !window.confirm(
                                `Transfer ownership to ${name}? You will become an admin.`,
                              )
                            ) {
                              return;
                            }
                            runAction(
                              `${member.userId}:owner`,
                              () =>
                                transferOwnershipAction(slug, {
                                  newOwnerUserId: member.userId,
                                }),
                              `${name} is now the group owner.`,
                            );
                          }}
                        >
                          <Crown />
                          Transfer ownership
                        </DropdownMenuItem>
                      </>
                    ) : null}

                    {canRemove(viewerRole, member) ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => {
                            if (
                              !window.confirm(
                                `Remove ${name} from this group? They'll lose access to the group's recipes. You can re-invite them anytime.`,
                              )
                            ) {
                              return;
                            }
                            runAction(
                              `${member.userId}:remove`,
                              () => removeMemberAction(slug, member.userId),
                              `${name} was removed from the group`,
                            );
                          }}
                        >
                          <Trash2 />
                          Remove from group
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
