"use client";

import * as React from "react";
import {
  Accessibility,
  Blocks,
  BookOpenText,
  Contrast,
  RotateCcw,
  Type,
  Zap,
} from "lucide-react";

import { TEXT_SIZES, type TextSize, isA11yActive } from "~/config/a11y";
import { cn } from "~/lib/utils";
import { useA11y } from "~/components/a11y/a11y-provider";
import { useTheme } from "~/components/theme/theme-provider";
import { Button } from "~/components/ui/button";
import { Switch } from "~/components/ui/switch";
import { Separator } from "~/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";

const TEXT_SIZE_META: Record<TextSize, { label: string; sample: string }> = {
  default: { label: "Default", sample: "text-sm" },
  large: { label: "Large", sample: "text-base" },
  xl: { label: "Larger", sample: "text-xl" },
};

function ToggleRow({
  id,
  icon: Icon,
  title,
  description,
  checked,
  onChange,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted/60">
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
        <Icon className="size-5" />
      </span>
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer select-none">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">
          {description}
        </span>
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/**
 * Accessibility & comfort controls — a third axis on top of theme + scheme.
 * Text size, contrast, motion and easy-reading type for everyone, plus a
 * one-tap Kids mode that switches to the big, bright, simplified theme.
 */
export function AccessibilityMenu() {
  const { prefs, update, reset } = useA11y();
  const { theme, setKidsMode } = useTheme();
  const active = isA11yActive(prefs);
  const kidsOn = theme === "kids";

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label="Accessibility & comfort settings"
          className="relative"
        >
          <Accessibility className="size-5" />
          {active && (
            <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-card bg-primary" />
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Accessibility className="size-5 text-primary" />
            Accessibility &amp; comfort
          </DialogTitle>
          <DialogDescription>
            Tune how {`Heirloom`} looks and reads. These settings work with any
            theme and are saved on this device.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Text size */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Type className="size-4 text-muted-foreground" />
              Text size
            </div>
            <div
              role="group"
              aria-label="Text size"
              className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1"
            >
              {TEXT_SIZES.map((size) => {
                const selected = prefs.textSize === size;
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => update({ textSize: size })}
                    aria-pressed={selected}
                    className={cn(
                      "flex flex-col items-center gap-0.5 rounded-lg py-2 transition-colors",
                      selected
                        ? "bg-card text-foreground shadow-token"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "font-display font-semibold leading-none",
                        TEXT_SIZE_META[size].sample,
                      )}
                    >
                      A
                    </span>
                    <span className="text-[0.7rem]">
                      {TEXT_SIZE_META[size].label}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Toggles */}
          <section className="flex flex-col">
            <ToggleRow
              id="a11y-contrast"
              icon={Contrast}
              title="High contrast"
              description="Stronger text and borders for easier reading."
              checked={prefs.contrast}
              onChange={(v) => update({ contrast: v })}
            />
            <ToggleRow
              id="a11y-motion"
              icon={Zap}
              title="Reduce motion"
              description="Turn off animations and transitions."
              checked={prefs.motion}
              onChange={(v) => update({ motion: v })}
            />
            <ToggleRow
              id="a11y-reading"
              icon={BookOpenText}
              title="Easy-reading text"
              description="Roomier spacing and a highly legible typeface."
              checked={prefs.reading}
              onChange={(v) => update({ reading: v })}
            />
          </section>

          <Separator />

          {/* Kids mode (bridges to the theme system) */}
          <section className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Blocks className="size-5" />
            </span>
            <label
              htmlFor="a11y-kids"
              className="min-w-0 flex-1 cursor-pointer select-none"
            >
              <span className="block text-sm font-semibold">Kids mode</span>
              <span className="block text-xs text-muted-foreground">
                Big buttons, bright colors, and simpler screens.
              </span>
            </label>
            <Switch
              id="a11y-kids"
              checked={kidsOn}
              onCheckedChange={setKidsMode}
            />
          </section>

          {active && (
            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              className="self-start text-muted-foreground"
            >
              <RotateCcw className="size-4" />
              Reset to defaults
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
