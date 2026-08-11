import { type Metadata } from "next";
import { type ReactNode } from "react";
import Link from "next/link";
import {
  Database,
  Download,
  UserX,
  UtensilsCrossed,
  Users,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { getCurrentUser, isAuthConfigured } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { listMyGroups } from "~/server/groups/queries";
import { Button } from "~/components/ui/button";
import { EmptyState } from "~/components/ui/empty-state";
import { CreateGroupDialog } from "~/components/groups/create-group-dialog";
import { GroupCard } from "~/components/groups/group-card";
import { withRouteMessages } from "~/components/i18n/route-messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: t("groups.title"),
    description: t("groups.description"),
  };
}

async function GroupsPage() {
  const user = await getCurrentUser();
  const authConfigured = isAuthConfigured();
  const dbConfigured = isDbConfigured();
  const groups = user ? await listMyGroups(user.id) : [];
  const t = await getTranslations("groups.page");

  if (authConfigured && dbConfigured && !user) return <SignInNudge />;

  return (
    <div className="container flex flex-col gap-10 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            {t("description")}
          </p>
        </div>
        {user && dbConfigured ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/settings/dietary">
                <UtensilsCrossed /> {t("links.dietary")}
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/settings/blocked">
                <UserX /> {t("links.blocked")}
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/settings/data">
                <Download /> {t("links.download")}
              </Link>
            </Button>
            <CreateGroupDialog />
          </div>
        ) : (
          <Button size="lg" disabled>
            {t("newGroup")}
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

async function EmptyGroups() {
  const t = await getTranslations("groups.page.empty");
  return (
    <EmptyState
      icon={<Users />}
      title={t("title")}
      description={t("body")}
      action={<CreateGroupDialog />}
    />
  );
}

async function SignInNudge() {
  const t = await getTranslations("groups.page.signIn");
  return (
    <div className="container py-16">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center shadow-token">
        <span className="bg-primary/12 inline-flex size-16 items-center justify-center rounded-2xl text-primary">
          <Users className="size-7" aria-hidden="true" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-2 text-muted-foreground">{t("body")}</p>
        </div>
      </div>
    </div>
  );
}

async function ConnectDbNotice() {
  const t = await getTranslations("dbNotice");
  return (
    <EmptyState
      icon={<Database />}
      title={t("title")}
      description={t.rich("groups", {
        code: (chunks: ReactNode) => (
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
            {chunks}
          </code>
        ),
      })}
    />
  );
}

export default withRouteMessages(GroupsPage);
