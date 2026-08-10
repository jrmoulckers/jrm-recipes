import { type Metadata } from "next";
import { type ReactNode } from "react";
import { Download, ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { getCurrentUser, isAuthConfigured } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { getDeletionPreview } from "~/server/users/deletion-preview";
import { DeleteAccountPanel } from "~/components/settings/delete-account-panel";
import { buttonVariants } from "~/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return { title: t("dataSettings.title") };
}

/**
 * "Your data" settings (issue #420). Long-time users worry their family's
 * recipes are locked inside an app. This page reassures them they aren't, and
 * hands over a complete, self-contained backup on demand. The download is a
 * plain authenticated GET to `/api/backup`, so it works even with JavaScript
 * disabled.
 */
export default async function DataSettingsPage() {
  const user = await getCurrentUser();
  const authConfigured = isAuthConfigured();
  const dbConfigured = isDbConfigured();
  const t = await getTranslations("settings.dataPage");

  if (authConfigured && dbConfigured && !user) return <SignInNudge />;

  // Erasure is irreversible, so the notice must describe *this* account. Only
  // fetched when there is a signed-in user to describe.
  const preview = user ? await getDeletionPreview(user.id) : null;

  return (
    <div className="container flex flex-col gap-8 py-10">
      <header className="max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-muted-foreground">{t("description")}</p>
      </header>

      <section className="max-w-2xl rounded-2xl border border-border bg-card p-8 shadow-token">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-4">
            <span className="bg-primary/12 inline-flex size-12 shrink-0 items-center justify-center rounded-2xl text-primary">
              <Download className="size-6" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">{t("download.title")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t.rich("download.body", {
                  code: (chunks: ReactNode) => (
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {chunks}
                    </code>
                  ),
                })}
              </p>
            </div>
          </div>

          <a
            href="/api/backup"
            className={buttonVariants({ className: "w-full sm:w-auto" })}
            download
          >
            <Download className="size-4" aria-hidden="true" />
            {t("download.cta")}
          </a>

          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
            {t("download.reassurance")}
          </p>
        </div>
      </section>

      {preview ? <DeleteAccountPanel preview={preview} /> : null}
    </div>
  );
}

async function SignInNudge() {
  const t = await getTranslations("settings.dataPage.signIn");
  return (
    <div className="container py-16">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center shadow-token">
        <span className="bg-primary/12 inline-flex size-16 items-center justify-center rounded-2xl text-primary">
          <Download className="size-7" aria-hidden="true" />
        </span>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-muted-foreground">{t("body")}</p>
      </div>
    </div>
  );
}
