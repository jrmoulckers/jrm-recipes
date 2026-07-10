"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { ImagePlus, X } from "lucide-react";
import { type CloudinaryUploadWidgetResults } from "next-cloudinary";

import { env } from "~/env";
import { cn } from "~/lib/utils";
import { recordStorageUsageAction } from "~/server/billing/usage-actions";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

/**
 * The Cloudinary upload widget is a heavy, interaction-gated dependency, so it's
 * split into its own async chunk and loaded on the client only when a configured
 * upload control actually renders (#201). It never ships in the editor route's
 * first-load JS, and the unconfigured URL-input fallback never fetches it at all.
 */
const CldUploadWidget = dynamic(
  () => import("next-cloudinary").then((mod) => mod.CldUploadWidget),
  { ssr: false },
);

/**
 * Cloudinary is optional. When it isn't configured the field degrades to a
 * plain image-URL input so recipes still work with zero setup (mirrors the
 * optional-auth / optional-db design elsewhere in the app).
 */
const cloudinaryConfigured = Boolean(
  env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME && env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
);

export function ImageUploadField({
  value,
  onChange,
  label,
  hint,
  folder = "heirloom",
  size = "default",
}: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  hint?: string;
  folder?: string;
  size?: "default" | "compact";
}) {
  const compact = size === "compact";

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
            alt="Selected photo preview"
            className="size-full object-cover"
          />
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Remove photo"
            className="group absolute end-2 top-2 inline-flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              aria-hidden="true"
              className="inline-flex size-8 items-center justify-center rounded-full bg-background/85 text-foreground shadow-token-sm backdrop-blur transition group-hover:bg-background"
            >
              <X className="size-4" />
            </span>
          </button>
        </figure>
      ) : cloudinaryConfigured ? (
        <div className={cn(compact ? "aspect-[3/2] max-w-56" : "aspect-video")}>
          <CldUploadWidget
            signatureEndpoint="/api/cloudinary/sign"
            options={{
              folder,
              maxFiles: 1,
              resourceType: "image",
              sources: ["local", "url", "camera"],
              clientAllowedFormats: [
                "png",
                "jpeg",
                "jpg",
                "webp",
                "gif",
                "avif",
              ],
              maxImageFileSize: 8_000_000,
            }}
            onSuccess={(result: CloudinaryUploadWidgetResults) => {
              const info = result.info;
              if (info && typeof info !== "string") {
                onChange(info.secure_url);
                // Meter storage against the plan cap (#318). Fire-and-forget:
                // the upload already succeeded, so a metering failure must never
                // surface to the user.
                if (typeof info.bytes === "number" && info.bytes > 0) {
                  void recordStorageUsageAction(info.bytes);
                }
              }
            }}
          >
            {({ open }) => (
              <button
                type="button"
                onClick={() => open()}
                className={cn(
                  "flex size-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/40 text-center text-muted-foreground transition hover:border-primary/50 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  compact ? "p-3" : "p-6",
                )}
              >
                <ImagePlus className={compact ? "size-5" : "size-6"} />
                <span
                  className={cn("font-medium", compact ? "text-xs" : "text-sm")}
                >
                  {compact ? "Add photo" : "Upload a photo"}
                </span>
                {compact ? null : (
                  <span className="text-xs text-muted-foreground">
                    Drag &amp; drop, take a photo, or paste a URL below
                  </span>
                )}
              </button>
            )}
          </CldUploadWidget>
        </div>
      ) : null}

      {value ? null : (
        <Input
          type="url"
          inputMode="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            cloudinaryConfigured
              ? "…or paste an image URL"
              : "Paste an image URL"
          }
          aria-label={label ? `${label} URL` : "Image URL"}
        />
      )}

      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
