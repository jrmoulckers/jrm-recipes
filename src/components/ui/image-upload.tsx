"use client";

import * as React from "react";
import { ImagePlus, X } from "lucide-react";
import {
  CldUploadWidget,
  type CloudinaryUploadWidgetResults,
} from "next-cloudinary";

import { env } from "~/env";
import { cn } from "~/lib/utils";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

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
            className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-full bg-background/85 text-foreground shadow-sm backdrop-blur transition hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" />
          </button>
        </figure>
      ) : cloudinaryConfigured ? (
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
            if (info && typeof info !== "string") {
              onChange(info.secure_url);
            }
          }}
        >
          {({ open }) => (
            <button
              type="button"
              onClick={() => open()}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/40 text-center text-muted-foreground transition hover:border-primary/50 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                compact ? "aspect-[3/2] max-w-56 p-3" : "aspect-video p-6",
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
