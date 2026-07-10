import { type Metadata } from "next";
import { Download, ShieldCheck } from "lucide-react";

import { getCurrentUser, isAuthConfigured } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { buttonVariants } from "~/components/ui/button";

export const metadata: Metadata = { title: "Your data" };

/**
 * "Your data" settings (issue #420). Long-time users worry their family's
 * recipes are locked inside an app; this page reassures them they aren't, and
 * hands over a complete, self-contained backup on demand. The download is a
 * plain authenticated GET to `/api/backup`, so it works even with JavaScript
 * disabled.
 */
export default async function DataSettingsPage() {
  const user = await getCurrentUser();
  const authConfigured = isAuthConfigured();
  const dbConfigured = isDbConfigured();

  if (authConfigured && dbConfigured && !user) return <SignInNudge />;

  return (
    <div className="container flex flex-col gap-8 py-10">
      <header className="max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Your data
        </h1>
        <p className="mt-1 text-muted-foreground">
          Your recipes are yours. Download your whole cookbook whenever you like
          — no account, app, or internet needed to read it later.
        </p>
      </header>

      <section className="max-w-2xl rounded-2xl border border-border bg-card p-8 shadow-token">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-4">
            <span className="bg-primary/12 inline-flex size-12 shrink-0 items-center justify-center rounded-2xl text-primary">
              <Download className="size-6" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">Download my cookbook</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                A single ZIP file with one easy-to-read page per recipe, plus a{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  recipes.json
                </code>{" "}
                copy for safekeeping. Your stories and where each recipe came
                from are included, so nothing is left behind.
              </p>
            </div>
          </div>

          <a
            href="/api/backup"
            className={buttonVariants({ className: "w-full sm:w-auto" })}
            download
          >
            <Download className="size-4" aria-hidden="true" />
            Download my cookbook (.zip)
          </a>

          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
            Prepared on our own servers — your recipes are never sent anywhere
            else.
          </p>
        </div>
      </section>
    </div>
  );
}

function SignInNudge() {
  return (
    <div className="container py-16">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center shadow-token">
        <span className="bg-primary/12 inline-flex size-16 items-center justify-center rounded-2xl text-primary">
          <Download className="size-7" aria-hidden="true" />
        </span>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Sign in to download your recipes
        </h1>
        <p className="text-muted-foreground">
          Your cookbook backup includes every recipe on your account, so we need
          to know it&apos;s you.
        </p>
      </div>
    </div>
  );
}
