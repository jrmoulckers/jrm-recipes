"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Accessibility,
  Blocks,
  BookOpenText,
  Contrast,
  Minus,
  Plus,
  RotateCcw,
  ShieldCheck,
  Type,
  Users,
  Zap,
} from "lucide-react";

import { TEXT_SIZES, type TextSize, isA11yActive } from "~/config/a11y";
import {
  DEFAULT_HOUSEHOLD,
  MAX_HOUSEHOLD,
  MIN_HOUSEHOLD,
} from "~/config/household";
import { cn } from "~/lib/utils";
import { useA11y } from "~/components/a11y/a11y-provider";
import { useHousehold } from "~/components/household/household-provider";
import { useKidsMode } from "~/components/theme/use-kids-mode";
import { PrivacyToggle } from "~/components/privacy/privacy-toggle";
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

/** Font-size preview class per option; the visible label + names are localized. */
const TEXT_SIZE_SAMPLE: Record<TextSize, string> = {
  default: "text-sm",
  large: "text-base",
  xl: "text-xl",
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
  // Name the switch with the title only; the longer description is linked via
  // aria-describedby so it's read as supplementary detail, not part of the name.
  const descriptionId = `${id}-description`;
  return (
    <div className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted/60">
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <label
          htmlFor={id}
          className="block cursor-pointer select-none text-sm font-medium"
        >
          {title}
        </label>
        <span id={descriptionId} className="block text-xs text-muted-foreground">
          {description}
        </span>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        aria-describedby={descriptionId}
      />
    </div>
  );
}

/**
 * Accessibility & comfort controls — a third axis on top of theme + scheme.
 * Text size, contrast, motion and easy-reading type for everyone, plus a
 * one-tap Kids mode that switches to the big, bright, simplified theme.
 */
export function AccessibilityMenu() {
  const t = useTranslations("accessibilityMenu");
  const { prefs, effective, update, reset } = useA11y();
  const { kidsOn, setKidsMode } = useKidsMode();
  const household = useHousehold();
  const active = isA11yActive(prefs);
  const householdValue = household.size ?? DEFAULT_HOUSEHOLD;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={active ? t("triggerActive") : t("trigger")}
          className="relative"
        >
          <Accessibility className="size-5" />
          {active && (
            <span className="absolute -end-0.5 -top-0.5 size-2.5 rounded-full border-2 border-card bg-primary" />
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Accessibility className="size-5 text-primary" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Text size */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Type className="size-4 text-muted-foreground" />
              {t("textSize.label")}
            </div>
            <div
              role="group"
              aria-label={t("textSizeGroup")}
              className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1"
            >
              {TEXT_SIZES.map((size) => {
                const selected = prefs.textSize === size;
                const label = t(`textSize.${size}`);
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => update({ textSize: size })}
                    aria-pressed={selected}
                    aria-label={t("textSize.option", { label })}
                    className={cn(
                      "flex flex-col items-center gap-0.5 rounded-lg py-2 transition-colors",
                      selected
                        ? "bg-card text-foreground shadow-token"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "font-display font-semibold leading-none",
                        TEXT_SIZE_SAMPLE[size],
                      )}
                    >
                      A
                    </span>
                    <span className="text-[0.7rem]">{label}</span>
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
              title={t("contrast.title")}
              description={
                prefs.contrast === undefined && effective.contrast
                  ? t("contrast.descriptionSystem")
                  : t("contrast.description")
              }
              checked={effective.contrast}
              onChange={(v) => update({ contrast: v ? "on" : "off" })}
            />
            <ToggleRow
              id="a11y-motion"
              icon={Zap}
              title={t("motion.title")}
              description={
                prefs.motion === undefined && effective.motion
                  ? t("motion.descriptionSystem")
                  : t("motion.description")
              }
              checked={effective.motion}
              onChange={(v) => update({ motion: v ? "on" : "off" })}
            />
            <ToggleRow
              id="a11y-reading"
              icon={BookOpenText}
              title={t("reading.title")}
              description={t("reading.description")}
              checked={prefs.reading}
              onChange={(v) => update({ reading: v })}
            />
          </section>

          <Separator />

          {/* Household size — auto-scale recipes for a busy family (#399) */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Users className="size-4 text-muted-foreground" />
              {t("household.label")}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label={t("household.decrement")}
                  disabled={householdValue <= MIN_HOUSEHOLD}
                  onClick={() => household.setSize(householdValue - 1)}
                >
                  <Minus />
                </Button>
                <div className="min-w-16 text-center">
                  <div
                    className={cn(
                      "font-display text-xl font-semibold tabular-nums",
                      household.size == null && "text-muted-foreground",
                    )}
                  >
                    {householdValue}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("household.people", { count: householdValue })}
                  </div>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label={t("household.increment")}
                  disabled={householdValue >= MAX_HOUSEHOLD}
                  onClick={() => household.setSize(householdValue + 1)}
                >
                  <Plus />
                </Button>
              </div>
              <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                {household.size == null
                  ? t("household.hintUnset")
                  : t("household.hintSet")}
              </p>
            </div>
            {household.size != null && (
              <Button
                variant="ghost"
                size="sm"
                onClick={household.clear}
                className="self-start text-muted-foreground"
              >
                <RotateCcw className="size-4" />
                {t("household.reset")}
              </Button>
            )}
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
              <span className="block text-sm font-semibold">
                {t("kids.title")}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t("kids.description")}
              </span>
            </label>
            <Switch
              id="a11y-kids"
              checked={kidsOn}
              onCheckedChange={setKidsMode}
            />
          </section>

          <Separator />

          {/* Privacy & analytics opt-out (#324) */}
          <section className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="size-4 text-muted-foreground" />
              {t("privacy")}
            </div>
            <PrivacyToggle />
          </section>

          {active && (
            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              className="self-start text-muted-foreground"
            >
              <RotateCcw className="size-4" />
              {t("reset")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
