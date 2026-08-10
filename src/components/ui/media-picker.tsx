"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Check, ImagePlus } from "lucide-react";
import { type CloudinaryUploadWidgetResults } from "next-cloudinary";

import { cn } from "~/lib/utils";
import {
  listAssetsAction,
  recordUploadAction,
  updateAltTextAction,
} from "~/server/media/actions";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  cloudinaryConfigured,
  type MediaSelection,
} from "~/components/ui/media-picker-config";
import { Spinner } from "~/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";

/**
 * The media picker (issue #656, epic #655): upload a new photo, re-use one the
 * caller already owns, or paste a link.
 *
 * The Cloudinary widget stays behind `next/dynamic` (#201). This module is
 * itself lazily imported by `ImageUploadField`, so neither the dialog nor the
 * widget lands in the editor route's first-load JS.
 */
const CldUploadWidget = dynamic(
  () => import("next-cloudinary").then((mod) => mod.CldUploadWidget),
  { ssr: false },
);

/**
 * Only the fields the grid renders. Declared here rather than imported from the
 * server module so no `server-only` type import ever reaches a client bundle.
 */
type PickerAsset = {
  id: string;
  url: string;
  altText: string | null;
};

type TabValue = "upload" | "library" | "link";

export function MediaPicker({
  open,
  onOpenChange,
  value,
  onChange,
  folder = "heirloom",
  altText: controlledAlt,
  onAltTextChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onChange: (selection: MediaSelection) => void;
  folder?: string;
  /**
   * Alt text owned by the caller (issue #659). When `onAltTextChange` is given
   * the field becomes controlled and the description is stored on the caller's
   * own row (`recipes.coverImageAlt`, `recipe_steps.imageAlt`) as well as on the
   * library asset, so a pasted link — which has no asset — can still be
   * described. Omit both to keep the asset-only behavior from #656.
   */
  altText?: string;
  onAltTextChange?: (altText: string) => void;
}) {
  const t = useTranslations("mediaPicker");

  const [tab, setTab] = React.useState<TabValue>(
    cloudinaryConfigured ? "upload" : "link",
  );
  const [assetId, setAssetId] = React.useState<string | null>(null);
  const [ownAltText, setOwnAltText] = React.useState("");
  const [altSaved, setAltSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const callerManagesAlt = onAltTextChange != null;
  const altText = callerManagesAlt ? (controlledAlt ?? "") : ownAltText;
  // Describable as soon as there is a photo when the caller stores the text
  // itself; otherwise only a library asset has somewhere to put it.
  const canDescribe = callerManagesAlt ? value.length > 0 : assetId != null;

  function setAltText(next: string) {
    if (onAltTextChange) onAltTextChange(next);
    else setOwnAltText(next);
    setAltSaved(false);
  }

  function select(next: MediaSelection, nextAlt: string) {
    setAssetId(next.assetId);
    setAltSaved(false);
    // A photo that already carries a description hands it over. An empty one
    // never clears what the caller has typed (the Link tab reports "" on every
    // keystroke, which would otherwise wipe the field as the URL is entered).
    if (nextAlt.length > 0 || !callerManagesAlt) setAltText(nextAlt);
    onChange(next);
  }

  async function saveAltText() {
    if (!assetId) return;
    const result = await updateAltTextAction({ id: assetId, altText });
    if (result.ok) {
      setAltSaved(true);
      setError(null);
    } else {
      setError(result.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(next) => setTab(next as TabValue)}>
          <TabsList>
            {cloudinaryConfigured ? (
              <TabsTrigger value="upload">{t("tabUpload")}</TabsTrigger>
            ) : null}
            <TabsTrigger value="library">{t("tabLibrary")}</TabsTrigger>
            <TabsTrigger value="link">{t("tabLink")}</TabsTrigger>
          </TabsList>

          {cloudinaryConfigured ? (
            <TabsContent value="upload">
              <UploadTab
                folder={folder}
                onUploaded={select}
                onError={setError}
              />
            </TabsContent>
          ) : null}

          {/* Radix unmounts an inactive tab panel, so the grid's fetch can't
              start until this tab is actually opened (acceptance criterion:
              no added first-load work for callers who never browse). */}
          <TabsContent value="library">
            <LibraryTab
              selectedUrl={value}
              onSelect={select}
              onError={setError}
            />
          </TabsContent>

          <TabsContent value="link">
            <LinkTab value={value} onSelect={select} />
          </TabsContent>
        </Tabs>

        <div className="flex flex-col gap-2">
          <Label htmlFor="media-picker-alt">{t("altLabel")}</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="media-picker-alt"
              value={altText}
              disabled={!canDescribe}
              onChange={(event) => setAltText(event.target.value)}
              maxLength={300}
              className="flex-1"
              placeholder={t("altPlaceholder")}
            />
            {/* Saving to the library asset is only possible for a photo that has
                one. When the caller stores the text itself it is already held in
                the surrounding form and saves with it. */}
            <Button
              type="button"
              variant="secondary"
              disabled={!assetId}
              onClick={() => void saveAltText()}
            >
              {t("altSave")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {canDescribe ? t("altHint") : t("altUnavailable")}
          </p>
          {/* Politely announced so the save is perceivable without sight. */}
          <p aria-live="polite" className="text-xs text-muted-foreground">
            {altSaved ? t("altSaved") : ""}
          </p>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t("done")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UploadTab({
  folder,
  onUploaded,
  onError,
}: {
  folder: string;
  onUploaded: (selection: MediaSelection, altText: string) => void;
  onError: (message: string | null) => void;
}) {
  const t = useTranslations("mediaPicker");

  return (
    <CldUploadWidget
      signatureEndpoint="/api/cloudinary/sign"
      options={{
        folder,
        maxFiles: 1,
        resourceType: "image",
        sources: ["local", "url", "camera"],
        clientAllowedFormats: ["png", "jpeg", "jpg", "webp", "gif", "avif"],
        maxImageFileSize: 8_000_000,
      }}
      onSuccess={(result: CloudinaryUploadWidgetResults) => {
        const info = result.info;
        if (!info || typeof info === "string") return;

        // Show the photo immediately; the library row is bookkeeping that must
        // never hold the editor up.
        onUploaded({ url: info.secure_url, assetId: null }, "");

        // `recordUploadAction` meters storage against the plan cap itself
        // (#318 moved into #657), so this replaces the old direct
        // `recordStorageUsageAction` call. Calling both would double-bill.
        void recordUploadAction({
          url: info.secure_url,
          publicId:
            typeof info.public_id === "string" ? info.public_id : undefined,
          width: typeof info.width === "number" ? info.width : undefined,
          height: typeof info.height === "number" ? info.height : undefined,
          bytes: typeof info.bytes === "number" ? info.bytes : undefined,
          format: typeof info.format === "string" ? info.format : undefined,
          folder,
        }).then(
          (recorded) => {
            if (recorded.ok) {
              onError(null);
              if (recorded.asset) {
                onUploaded(
                  { url: recorded.asset.url, assetId: recorded.asset.id },
                  recorded.asset.altText ?? "",
                );
              }
            } else {
              onError(recorded.error);
            }
          },
          () => onError(t("uploadError")),
        );
      }}
    >
      {({ open }) => (
        <button
          type="button"
          onClick={() => open()}
          className="flex aspect-video w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-muted-foreground transition hover:border-primary/50 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ImagePlus className="size-6" />
          <span className="text-sm font-medium">{t("uploadPhoto")}</span>
          <span className="text-xs">{t("dropHint")}</span>
        </button>
      )}
    </CldUploadWidget>
  );
}

/**
 * The caller's own photos, newest first, keyset-paginated. The grid is a
 * radiogroup with roving tabindex: one stop in the page's tab order, arrow keys
 * to move between thumbnails, which is what a picture grid should be.
 */
function LibraryTab({
  selectedUrl,
  onSelect,
  onError,
}: {
  selectedUrl: string;
  onSelect: (selection: MediaSelection, altText: string) => void;
  onError: (message: string | null) => void;
}) {
  const t = useTranslations("mediaPicker");

  const [assets, setAssets] = React.useState<PickerAsset[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadedOnce, setLoadedOnce] = React.useState(false);
  const [focusIndex, setFocusIndex] = React.useState(0);
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const load = React.useCallback(
    async (from: string | null) => {
      setLoading(true);
      const result = await listAssetsAction(from ? { cursor: from } : {});
      if (result.ok) {
        const page = result.page.assets.map((asset) => ({
          id: asset.id,
          url: asset.url,
          altText: asset.altText,
        }));
        setAssets((prev) => (from ? [...prev, ...page] : page));
        setCursor(result.page.nextCursor);
        onError(null);
      } else {
        onError(result.error);
      }
      setLoading(false);
      setLoadedOnce(true);
    },
    [onError],
  );

  React.useEffect(() => {
    void load(null);
  }, [load]);

  function move(next: number) {
    if (assets.length === 0) return;
    const index = (next + assets.length) % assets.length;
    setFocusIndex(index);
    itemRefs.current[index]?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        move(focusIndex + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        move(focusIndex - 1);
        break;
      case "Home":
        event.preventDefault();
        move(0);
        break;
      case "End":
        event.preventDefault();
        move(assets.length - 1);
        break;
      default:
        break;
    }
  }

  if (loading && !loadedOnce) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        {t("loading")}
      </p>
    );
  }

  if (assets.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="radiogroup"
        aria-label={t("libraryLabel")}
        onKeyDown={onKeyDown}
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4"
      >
        {assets.map((asset, index) => {
          const checked = asset.url === selectedUrl;
          return (
            <button
              key={asset.id}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={asset.altText ?? t("untitledPhoto")}
              tabIndex={index === focusIndex ? 0 : -1}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              onFocus={() => setFocusIndex(index)}
              onClick={() =>
                onSelect(
                  { url: asset.url, assetId: asset.id },
                  asset.altText ?? "",
                )
              }
              className={cn(
                "relative aspect-square overflow-hidden rounded-lg border border-border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                checked && "ring-2 ring-primary",
              )}
            >
              {/* Decorative: the button already carries the photo's name, so a
                  second copy on the image would double-announce it. */}
              {/* eslint-disable-next-line @next/next/no-img-element -- library thumbnails come from arbitrary stored URLs that can't be pre-allowlisted for next/image */}
              <img
                src={asset.url}
                alt=""
                loading="lazy"
                decoding="async"
                className="size-full object-cover"
              />
              {checked ? (
                <span className="absolute end-1 top-1 rounded-full bg-primary p-1 text-primary-foreground">
                  <Check className="size-3" aria-hidden="true" />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {cursor ? (
        <Button
          type="button"
          variant="outline"
          loading={loading}
          onClick={() => void load(cursor)}
        >
          {t("loadMore")}
        </Button>
      ) : null}
    </div>
  );
}

function LinkTab({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (selection: MediaSelection, altText: string) => void;
}) {
  const t = useTranslations("mediaPicker");

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="media-picker-link">{t("linkLabel")}</Label>
      <Input
        id="media-picker-link"
        type="url"
        inputMode="url"
        value={value}
        placeholder={t("linkPlaceholder")}
        onChange={(event) =>
          onSelect({ url: event.target.value, assetId: null }, "")
        }
      />
    </div>
  );
}
