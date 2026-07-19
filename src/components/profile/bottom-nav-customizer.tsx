"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";

import {
  MAX_PINNED,
  navByKey,
  pinnableNav,
  type NavKey,
} from "~/config/nav";
import { useBottomNavStore } from "~/lib/bottom-nav-store";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";

/**
 * Accessible editor for the mobile bottom bar's pinned tabs. The Profile slot
 * is fixed, so the user curates up to {@link MAX_PINNED} other destinations and
 * their order. Reorder is keyboard-first (Move up / Move down buttons) rather
 * than drag-only, and every change is announced through a polite live region so
 * screen-reader users can follow the resulting bar.
 */
export function BottomNavCustomizer({
  trigger,
}: {
  trigger?: React.ReactNode;
}) {
  const t = useTranslations("profile.customize");
  const tNav = useTranslations("nav");
  const pinned = useBottomNavStore((s) => s.pinned);
  const toggle = useBottomNavStore((s) => s.toggle);
  const moveUp = useBottomNavStore((s) => s.moveUp);
  const moveDown = useBottomNavStore((s) => s.moveDown);
  const reset = useBottomNavStore((s) => s.reset);

  const [announcement, setAnnouncement] = React.useState("");

  const label = React.useCallback(
    (key: NavKey) => tNav(navByKey[key].labelKey),
    [tNav],
  );

  const available = pinnableNav.filter((item) => !pinned.includes(item.id));
  const atCap = pinned.length >= MAX_PINNED;

  const announcePosition = (key: NavKey, list: NavKey[]) => {
    const index = list.indexOf(key);
    setAnnouncement(
      t("announce.position", {
        label: label(key),
        position: index + 1,
        total: list.length,
      }),
    );
  };

  const handlePin = (key: NavKey) => {
    toggle(key);
    setAnnouncement(
      t("announce.pinned", { label: label(key), total: pinned.length + 1 }),
    );
  };

  const handleUnpin = (key: NavKey) => {
    toggle(key);
    setAnnouncement(t("announce.unpinned", { label: label(key) }));
  };

  const handleMoveUp = (key: NavKey) => {
    if (pinned.indexOf(key) <= 0) return;
    const next = [...pinned];
    const i = next.indexOf(key);
    [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
    moveUp(key);
    announcePosition(key, next);
  };

  const handleMoveDown = (key: NavKey) => {
    const i = pinned.indexOf(key);
    if (i === -1 || i >= pinned.length - 1) return;
    const next = [...pinned];
    [next[i], next[i + 1]] = [next[i + 1]!, next[i]!];
    moveDown(key);
    announcePosition(key, next);
  };

  const handleReset = () => {
    reset();
    setAnnouncement(t("announce.reset"));
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? <Button variant="outline">{t("trigger")}</Button>}
      </DialogTrigger>
      <DialogContent size="md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description", { max: MAX_PINNED })}
          </DialogDescription>
        </DialogHeader>

        {/* Pinned, ordered set. */}
        <section aria-labelledby="customize-pinned-heading">
          <h3
            id="customize-pinned-heading"
            className="mb-2 text-sm font-semibold text-foreground"
          >
            {t("pinnedHeading", { count: pinned.length, max: MAX_PINNED })}
          </h3>
          {pinned.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              {t("emptyPinned")}
            </p>
          ) : (
            <ul className="grid gap-1.5">
              {pinned.map((key, index) => {
                const item = navByKey[key];
                const Icon = item.icon;
                return (
                  <li
                    key={key}
                    className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
                  >
                    <Icon
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {label(key)}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {index + 1}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={index === 0}
                      aria-label={t("moveUp", { label: label(key) })}
                      onClick={() => handleMoveUp(key)}
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={index === pinned.length - 1}
                      aria-label={t("moveDown", { label: label(key) })}
                      onClick={() => handleMoveDown(key)}
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={t("remove", { label: label(key) })}
                      onClick={() => handleUnpin(key)}
                    >
                      <X className="size-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Destinations available to pin. */}
        {available.length > 0 && (
          <section aria-labelledby="customize-available-heading">
            <h3
              id="customize-available-heading"
              className="mb-2 text-sm font-semibold text-foreground"
            >
              {t("availableHeading")}
            </h3>
            {atCap && (
              <p className="mb-2 text-xs text-muted-foreground">
                {t("capReached", { max: MAX_PINNED })}
              </p>
            )}
            <ul className="grid gap-1.5">
              {available.map((item) => {
                const Icon = item.icon;
                return (
                  <li
                    key={item.id}
                    className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
                  >
                    <Icon
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {label(item.id)}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={atCap}
                      aria-label={t("add", { label: label(item.id) })}
                      onClick={() => handlePin(item.id)}
                    >
                      <Plus className="size-4" />
                      {t("addShort")}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Polite live region: narrates pin/unpin/reorder for screen readers. */}
        <div aria-live="polite" className="sr-only" role="status">
          {announcement}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="ghost" onClick={handleReset}>
            {t("reset")}
          </Button>
          <DialogClose asChild>
            <Button type="button">{t("done")}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
