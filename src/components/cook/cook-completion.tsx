"use client";

import * as React from "react";
import { Camera, PartyPopper, RotateCcw } from "lucide-react";

import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";

/**
 * "You did it!" completion moment (#437). Replaces the instant navigation that
 * used to fire the second a cook finished, giving young chefs a celebratory
 * pause to snap an "I made it!" photo of their dish before leaving.
 *
 * The photo is captured with a plain file input (`capture="environment"` opens
 * the camera on mobile, with a gallery fallback) and previewed locally via an
 * object URL — no upload required, so it works offline and never blocks. If the
 * camera is denied or unavailable the input simply yields nothing and the moment
 * still works. `celebratory` (Kids mode) turns up the styling and copy.
 *
 * `children` is a reward slot the badge feature (#413) renders into.
 */
export function CookCompletion({
  recipeTitle,
  celebratory,
  onDone,
  children,
}: {
  recipeTitle: string;
  celebratory: boolean;
  onDone: () => void;
  children?: React.ReactNode;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const [photoUrl, setPhotoUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // Release the object URL when it changes or the moment unmounts.
  React.useEffect(() => {
    if (!photoUrl) return;
    return () => {
      if (typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(photoUrl);
      }
    };
  }, [photoUrl]);

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (typeof URL.createObjectURL !== "function") return;
    setPhotoUrl((prev) => {
      if (prev && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(prev);
      }
      return URL.createObjectURL(file);
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cook-completion-title"
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-background/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur"
    >
      <div
        className={cn(
          "w-full max-w-md rounded-3xl border border-border bg-card p-6 text-center text-card-foreground shadow-token-lg motion-safe:animate-fade-in sm:p-8",
          celebratory && "max-w-lg",
        )}
      >
        <div
          className={cn(
            "mx-auto flex items-center justify-center rounded-full bg-success/15 text-success",
            celebratory ? "size-20" : "size-14",
          )}
          aria-hidden="true"
        >
          <PartyPopper className={celebratory ? "size-10" : "size-7"} />
        </div>

        <h1
          id="cook-completion-title"
          ref={headingRef}
          tabIndex={-1}
          className={cn(
            "mt-4 text-pretty font-display font-bold tracking-tight focus:outline-none",
            celebratory ? "text-4xl" : "text-2xl",
          )}
        >
          {celebratory ? "You did it! 🎉" : "Nicely done!"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          You finished <span className="font-semibold">{recipeTitle}</span>.
        </p>

        {children}

        {photoUrl ? (
          <figure className="mt-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt={`My finished ${recipeTitle}`}
              className="mx-auto max-h-72 w-full rounded-2xl object-cover shadow-token"
            />
            <figcaption className="mt-2 text-sm text-muted-foreground">
              {celebratory ? "Look what I made! 🍰" : "Your finished dish"}
            </figcaption>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => inputRef.current?.click()}
            >
              <RotateCcw />
              Retake photo
            </Button>
          </figure>
        ) : (
          <Button
            type="button"
            size={celebratory ? "xl" : "lg"}
            className="mt-6 w-full gap-2"
            onClick={() => inputRef.current?.click()}
          >
            <Camera />I made it! 📸 Take a photo
          </Button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onPick}
        />

        <Button
          type="button"
          variant={photoUrl ? "default" : "ghost"}
          size="lg"
          className="mt-3 w-full"
          onClick={onDone}
        >
          {photoUrl ? "All done" : "Skip and finish"}
        </Button>
      </div>
    </div>
  );
}
