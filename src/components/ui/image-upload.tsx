"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { ImageOff, ImagePlus } from "lucide-react";

import { cn } from "~/lib/utils";
import { CloseButton } from "~/components/ui/close-button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  cloudinaryConfigured,
  type MediaSelection,
} from "~/components/ui/media-picker-config";

/**
 * The picker dialog — its tabs, the photo grid, and the Cloudinary upload
 * widget it wraps — is interaction-gated, so it is split into its own async
 * chunk and fetched only once a field is actually opened. That keeps both the
 * dialog and the heavy widget (#201) out of the recipe editor route's
 * first-load JS, which is budgeted in `bundle-budgets.json`.
 */
const MediaPicker = dynamic(
  () => import("~/components/ui/media-picker").then((mod) => mod.MediaPicker),
  { ssr: false },
);

/**
 * A single image field. Since #656 it is a thin wrapper over the media picker,
 * so every call site (recipe cover, step photos, cook log, reviews, quick
 * capture) inherits upload + library reuse + link with no change of its own.
 *
 * `onChange` also receives the media-library asset id when the chosen photo has
 * one, which callers may ignore; the URL-only signature still type-checks.
 *
 * When Cloudinary isn't configured there is nothing to upload and nothing to
 * store, so the field degrades to the plain image-URL input it has always been
 * and the picker chunk is never fetched at all.
 */
export function ImageUploadField({
  value,
  onChange,
  label,
  hint,
  folder = "heirloom",
  size = "default",
}: {
  value: string;
  onChange: (url: string, assetId?: string | null) => void;
  label?: string;
  hint?: string;
  folder?: string;
  size?: "default" | "compact";
}) {
  const t = useTranslations("imageUpload");
  const compact = size === "compact";
  const [pickerOpen, setPickerOpen] = React.useState(false);

  // A pasted URL can be a typo, a hotlink-blocked host, or a since-deleted
  // image. Track load failures so we can swap the browser's broken-image glyph
  // for a readable fallback (and re-surface the URL input to fix it inline).
  const [errored, setErrored] = React.useState(false);
  React.useEffect(() => {
    setErrored(false);
  }, [value]);

  function onPicked(selection: MediaSelection) {
    onChange(selection.url, selection.assetId);
  }

  return (
    <div className="flex flex-col gap-2">
      {label ? <Label>{label}</Label> : null}

      {value ? (
        <figure
          className={cn(
            "relative overflow-hidden rounded-xl border border-border bg-muted",
            compact ? "aspect-[3/2] max-w-56" : "aspect-video",
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- editor preview accepts arbitrary user-pasted URLs that can't be pre-allowlisted for next/image */}
          <img
            src={value}
            alt={t("previewAlt")}
            loading="lazy"
            decoding="async"
            onError={() => setErrored(true)}
            onLoad={() => setErrored(false)}
            className={cn("size-full object-cover", errored && "hidden")}
          />
          {errored ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-muted p-3 text-center text-muted-foreground">
              <ImageOff
                className={compact ? "size-5" : "size-6"}
                aria-hidden="true"
              />
              <span
                className={cn("font-medium", compact ? "text-xs" : "text-sm")}
              >
                {t("errorTitle")}
              </span>
              {compact ? null : (
                <span className="text-xs">{t("errorHint")}</span>
              )}
            </div>
          ) : null}
          <CloseButton
            variant="overlay"
            onClick={() => onChange("", null)}
            label={t("remove")}
            className="absolute end-2 top-2"
          />
        </figure>
      ) : cloudinaryConfigured ? (
        <div className={cn(compact ? "aspect-[3/2] max-w-56" : "aspect-video")}>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className={cn(
              "flex size-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/40 text-center text-muted-foreground transition hover:border-primary/50 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              compact ? "p-3" : "p-6",
            )}
          >
            <ImagePlus className={compact ? "size-5" : "size-6"} />
            <span
              className={cn("font-medium", compact ? "text-xs" : "text-sm")}
            >
              {compact ? t("addPhoto") : t("uploadPhoto")}
            </span>
            {compact ? null : (
              <span className="text-xs text-muted-foreground">
                {t("dropHint")}
              </span>
            )}
          </button>
        </div>
      ) : null}

      {/* Without Cloudinary the URL input is the whole experience, so it stays
          inline rather than behind a dialog no upload could ever fill. */}
      {cloudinaryConfigured || (value && !errored) ? null : (
        <Input
          type="url"
          inputMode="url"
          value={value}
          onChange={(e) => onChange(e.target.value, null)}
          placeholder={t("urlPlaceholder")}
          aria-label={label ? t("urlLabelFor", { label }) : t("urlLabel")}
        />
      )}

      {/* A chosen photo can still be swapped for another from the library. */}
      {cloudinaryConfigured && value ? (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="self-start rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("change")}
        </button>
      ) : null}

      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}

      {/* Mounted only after the first open, so a field the user never touches
          never fetches the picker chunk. */}
      {cloudinaryConfigured && pickerOpen ? (
        <MediaPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          value={value}
          onChange={onPicked}
          folder={folder}
        />
      ) : null}
    </div>
  );
}
