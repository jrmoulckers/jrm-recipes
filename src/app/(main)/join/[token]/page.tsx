import { type Metadata } from "next";
import Link from "next/link";
import { CalendarX2, Link2Off, Users } from "lucide-react";

import { getCurrentUser, isAuthConfigured } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import {
  getInviteLinkPreview,
  type InviteLinkStatus,
} from "~/server/groups/queries";
import { JoinGroupPanel } from "~/components/groups/join-group-panel";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import { brand } from "~/config/brand";

// Invite links are private, single-purpose URLs — never index them.
export const metadata: Metadata = {
  title: "Join a family cookbook",
  robots: { index: false, follow: false },
};

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
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

const STATUS_COPY: Record<
  Exclude<InviteLinkStatus, "active">,
  { title: string; body: string }
> = {
  expired: {
    title: "This invite link has expired",
    body: "Ask whoever shared it to send you a fresh link.",
  },
  revoked: {
    title: "This invite link is no longer active",
    body: "The group turned this link off. Ask them for a new one.",
  },
  exhausted: {
    title: "This invite link is all used up",
    body: "It reached its limit. Ask the group for a fresh link.",
  },
};

function StatusCard({
  status,
}: {
  status: Exclude<InviteLinkStatus, "active">;
}) {
  const copy = STATUS_COPY[status];
  const Icon = status === "expired" ? CalendarX2 : Link2Off;
  return (
    <Shell>
      <span className="mx-auto inline-flex size-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Icon className="size-7" aria-hidden="true" />
      </span>
      <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">
        {copy.title}
      </h1>
      <p className="mt-2 text-muted-foreground">{copy.body}</p>
      <Button asChild variant="outline" className="mt-6">
        <Link href="/">Back to {brand.name}</Link>
      </Button>
    </Shell>
  );
}

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const preview = isDbConfigured() ? await getInviteLinkPreview(token) : null;

  if (!preview) {
    return (
      <Shell>
        <span className="mx-auto inline-flex size-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Link2Off className="size-7" aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">
          This invite link isn&apos;t valid
        </h1>
        <p className="mt-2 text-muted-foreground">
          The link may be mistyped or no longer exists. Ask whoever shared it to
          send you a fresh one.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/">Back to {brand.name}</Link>
        </Button>
      </Shell>
    );
  }

  if (preview.status !== "active") {
    return <StatusCard status={preview.status} />;
  }

  const [user, authConfigured] = [await getCurrentUser(), isAuthConfigured()];
  const { group, memberCount } = preview;

  return (
    <Shell>
      <Avatar className="mx-auto size-20">
        {group.avatarUrl ? (
          <AvatarImage src={group.avatarUrl} alt={group.name} />
        ) : null}
        <AvatarFallback className="text-xl">
          {initials(group.name)}
        </AvatarFallback>
      </Avatar>
      <p className="mt-4 text-sm font-medium text-primary">
        You&apos;re invited to join
      </p>
      <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">
        {group.name}
      </h1>
      {group.description ? (
        <p className="mt-2 text-muted-foreground">{group.description}</p>
      ) : (
        <p className="mt-2 text-muted-foreground">
          A shared family cookbook on {brand.name}.
        </p>
      )}
      <p className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <Users className="size-4" aria-hidden="true" />
        {memberCount} {memberCount === 1 ? "member" : "members"}
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
