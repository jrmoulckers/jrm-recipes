import { type Metadata } from "next";
import Link from "next/link";
import { type ReactNode } from "react";
import { Images } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { getCurrentUser, isAuthConfigured } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { getLimitStatus } from "~/server/billing/entitlements";
import { listAssets } from "~/server/media/queries";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import { UsageMeter } from "~/components/billing/usage-meter";
import { UsageLimitNotice } from "~/components/billing/usage-limit-notice";
import { withRouteMessages } from "~/components/i18n/route-messages";
import {
  PhotoLibrary,
  type LibraryAsset,
} from "~/components/settings/photo-library";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return { title: t("photoSettings.title") };
}

/** MB → human copy, promoting to GB once we cross a gigabyte. Mirrors billing. */
function formatMb(mb: number): string {
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${gb.toLocaleString(undefined, {
      maximumFractionDigits: Number.isInteger(gb) ? 0 : 1,
    })} GB`;
  }
  return `${mb.toLocaleString()} MB`;
}

/**
 * The photo library management surface (issue #658, epic #655).
 *
 * Everything a cook has uploaded, in one place: a paginated grid, the details
 * of the selected photo, an alt-text editor, delete behind a confirm dialog
 * that names both the photo and where it is still used, and a storage meter
 * reusing the billing entitlement components.
 *
 * The first page is fetched on the server so the grid is populated on arrival;
 * subsequent pages come from `listAssetsAction`. Every dependency degrades
 * calmly: no database or no Cloudinary yields an empty library, not an error.
 */
async function PhotoSettingsPage() {
  const user = await getCurrentUser();
  const dbConfigured = isDbConfigured();
  const t = await getTranslations("settings.photosPage");

  if (isAuthConfigured() && dbConfigured && !user) return <SignInNudge />;

  const [page, storage] = user
    ? await Promise.all([
        listAssets(user),
        getLimitStatus(user, "maxStorageMb", "storage_mb"),
      ])
    : ([{ assets: [], nextCursor: null }, null] as const);

  const assets: LibraryAsset[] = page.assets.map((asset) => ({
    id: asset.id,
    url: asset.url,
    altText: asset.altText,
    width: asset.width,
    height: asset.height,
    bytes: asset.bytes,
    createdAt: asset.createdAt.toISOString(),
  }));

  return (
    <div className="container flex flex-col gap-8 py-10">
      <header className="max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-muted-foreground">{t("description")}</p>
      </header>

      {storage ? (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>{t("storage.title")}</CardTitle>
            <CardDescription>{t("storage.description")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <UsageMeter
              label={t("storage.label")}
              used={storage.used}
              limit={storage.limit}
              ratio={storage.ratio}
              state={storage.state}
              format={formatMb}
            />
            {storage.limit !== null && storage.state !== "ok" ? (
              <UsageLimitNotice
                used={storage.used}
                limit={storage.limit}
                state={storage.state}
                resource={t("storage.resource")}
              />
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {!dbConfigured ? (
        <ConnectDbNotice />
      ) : assets.length === 0 ? (
        <EmptyState
          icon={<Images aria-hidden="true" />}
          title={t("empty.title")}
          description={t("empty.description")}
          action={
            <Button asChild>
              <Link href="/recipes/new">{t("empty.action")}</Link>
            </Button>
          }
        />
      ) : (
        <PhotoLibrary initialAssets={assets} initialCursor={page.nextCursor} />
      )}
    </div>
  );
}

async function SignInNudge() {
  const t = await getTranslations("settings.photosPage.signIn");
  return (
    <div className="container py-16">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center shadow-token">
        <span className="bg-primary/12 inline-flex size-16 items-center justify-center rounded-2xl text-primary">
          <Images className="size-7" aria-hidden="true" />
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
        {t.rich("photos", {
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

export default withRouteMessages(PhotoSettingsPage);
