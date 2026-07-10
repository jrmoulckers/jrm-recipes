import { type Metadata } from "next";
import Link from "next/link";
import {
  Database,
  Download,
  UserX,
  UtensilsCrossed,
  Users,
} from "lucide-react";

import { getCurrentUser, isAuthConfigured } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { listMyGroups } from "~/server/groups/queries";
import { Button } from "~/components/ui/button";
import { EmptyState } from "~/components/ui/empty-state";
import { CreateGroupDialog } from "~/components/groups/create-group-dialog";
import { GroupCard } from "~/components/groups/group-card";

export const metadata: Metadata = {
  title: "Family",
  description: "Shared cookbooks for the people you cook with.",
};

export default async function GroupsPage() {
  const user = await getCurrentUser();
  const authConfigured = isAuthConfigured();
  const dbConfigured = isDbConfigured();
  const groups = user ? await listMyGroups(user.id) : [];

  if (authConfigured && dbConfigured && !user) return <SignInNudge />;

  return (
    <div className="container flex flex-col gap-10 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Your families &amp; groups
          </h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            Gather the cooks, tasters, and story-keepers who make your recipes
            feel like home.
          </p>
        </div>
        {user && dbConfigured ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/settings/dietary">
                <UtensilsCrossed /> Dietary profiles
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/settings/blocked">
                <UserX /> Blocked people
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/settings/data">
                <Download /> Download cookbook
              </Link>
            </Button>
            <CreateGroupDialog />
          </div>
        ) : (
          <Button size="lg" disabled>
            New group
          </Button>
        )}
      </header>

      {!dbConfigured ? (
        <ConnectDbNotice />
      ) : groups.length > 0 ? (
        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <GroupCard key={group.id} group={group} />
          ))}
        </section>
      ) : (
        <EmptyGroups />
      )}
    </div>
  );
}

function EmptyGroups() {
  return (
    <EmptyState
      icon={<Users />}
      title="Start a family table"
      description="Create a space for the people who share weeknight wins, holiday classics, and the little notes that make a dish yours."
      action={<CreateGroupDialog />}
    />
  );
}

function SignInNudge() {
  return (
    <div className="container py-16">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center shadow-token">
        <span className="bg-primary/12 inline-flex size-16 items-center justify-center rounded-2xl text-primary">
          <Users className="size-7" aria-hidden="true" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Family groups are private
          </h1>
          <p className="mt-2 text-muted-foreground">
            Sign in from the header to create a group and cook together.
          </p>
        </div>
      </div>
    </div>
  );
}

function ConnectDbNotice() {
  return (
    <EmptyState
      icon={<Database />}
      title="Connect a database to start"
      description={
        <>
          Set{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
            DATABASE_URL
          </code>{" "}
          or start the local Postgres container.
        </>
      }
    />
  );
}
