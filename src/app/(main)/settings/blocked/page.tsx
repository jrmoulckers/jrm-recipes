import { type Metadata } from "next";
import { UserX } from "lucide-react";

import { getCurrentUser, isAuthConfigured } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { listBlockedPeople } from "~/server/moderation/blocks";
import { BlockedPeopleList } from "~/components/settings/blocked-people-list";

export const metadata: Metadata = { title: "Blocked people" };

export default async function BlockedPeoplePage() {
  const user = await getCurrentUser();
  const authConfigured = isAuthConfigured();
  const dbConfigured = isDbConfigured();

  if (authConfigured && dbConfigured && !user) return <SignInNudge />;

  const people = user ? await listBlockedPeople(user) : [];

  return (
    <div className="container flex flex-col gap-8 py-10">
      <header className="max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Blocked people
        </h1>
        <p className="mt-1 text-muted-foreground">
          People you&apos;ve blocked won&apos;t see your comments and reviews,
          and you won&apos;t see theirs. Blocking is private — they&apos;re
          never told.
        </p>
      </header>

      {!dbConfigured ? (
        <ConnectDbNotice />
      ) : (
        <div className="max-w-2xl">
          <BlockedPeopleList people={people} />
        </div>
      )}
    </div>
  );
}

function SignInNudge() {
  return (
    <div className="container py-16">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center shadow-token">
        <span className="bg-primary/12 inline-flex size-16 items-center justify-center rounded-2xl text-primary">
          <UserX className="size-7" aria-hidden="true" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Your block list is private
          </h1>
          <p className="mt-2 text-muted-foreground">
            Sign in from the header to manage who you&apos;ve blocked.
          </p>
        </div>
      </div>
    </div>
  );
}

function ConnectDbNotice() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-8 text-center text-muted-foreground">
      <p className="mx-auto max-w-md">
        Connect a database to manage blocked people. Set{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
          DATABASE_URL
        </code>{" "}
        or start the local Postgres container.
      </p>
    </div>
  );
}
