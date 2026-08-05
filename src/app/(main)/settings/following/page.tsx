import { type Metadata } from "next";
import { type ReactNode } from "react";
import { Users } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { getCurrentUser, isAuthConfigured } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { PublicActivityOptIn } from "~/components/settings/public-activity-opt-in";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return { title: t("followingSettings.title") };
}

export default async function FollowingSettingsPage() {
  const user = await getCurrentUser();
  const authConfigured = isAuthConfigured();
  const dbConfigured = isDbConfigured();
  const t = await getTranslations("settings.followingPage");

  if (authConfigured && dbConfigured && !user) return <SignInNudge />;

  return (
    <div className="container flex flex-col gap-8 py-10">
      <header className="max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-muted-foreground">{t("description")}</p>
      </header>

      {!dbConfigured ? (
        <ConnectDbNotice />
      ) : (
        <div className="max-w-2xl">
          <PublicActivityOptIn
            defaultOptedIn={user?.publicActivityOptIn ?? false}
          />
        </div>
      )}
    </div>
  );
}

async function SignInNudge() {
  const t = await getTranslations("settings.followingPage.signIn");
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
    <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-8 text-center text-muted-foreground">
      <p className="mx-auto max-w-md">
        {t.rich("following", {
          code: (chunks: ReactNode) => (
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
              {chunks}
            </code>
          ),
        })}
      </p>
    </div>
  );
}
