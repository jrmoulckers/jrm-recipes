"use client";

import { ChevronDown, History, RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { describeQuantity } from "~/lib/shopping-list";
import { Button } from "~/components/ui/button";
import type { ShoppingViewItem } from "./shopping-list-view";

export type ShoppingHistoryOperation =
  "remove-completed" | "clear-all" | "bulk-move" | "list-rebuild" | "restore";

export type ShoppingHistoryEntry = {
  id: string;
  operation: ShoppingHistoryOperation;
  createdAt: Date | number | string;
  items: ShoppingViewItem[];
  restorePoints?: { listId: string; restorePointId: string }[];
};

export function ShoppingHistory({
  entries,
  disabled,
  onRestore,
}: {
  entries: ShoppingHistoryEntry[];
  disabled: boolean;
  onRestore: (entry: ShoppingHistoryEntry) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("shopping.history");
  const dateTime = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });

  return (
    <section aria-labelledby="shopping-history-heading">
      <details className="group rounded-xl border border-border bg-surface/40">
        <summary
          id="shopping-history-summary"
          className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden"
        >
          <span className="flex items-center gap-2">
            <History className="size-4 text-primary" aria-hidden="true" />
            <span id="shopping-history-heading">{t("title")}</span>
          </span>
          <span className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
            <span>{t("count", { count: entries.length })}</span>
            <ChevronDown
              className="size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </span>
        </summary>
        <div className="border-t border-border px-4 py-4">
          <p className="mb-4 text-sm text-muted-foreground">{t("retention")}</p>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ol className="grid gap-3">
              {entries.map((entry) => {
                const createdAt = new Date(entry.createdAt);
                const dateLabel = dateTime.format(createdAt);
                const operationLabel = t(`operations.${entry.operation}`);
                return (
                  <li
                    key={entry.id}
                    className="rounded-lg border border-border bg-background"
                  >
                    <details className="group/entry">
                      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                        <span className="flex items-center gap-2 font-medium">
                          <ChevronDown
                            className="size-4 shrink-0 transition-transform group-open/entry:rotate-180 motion-reduce:transition-none"
                            aria-hidden="true"
                          />
                          {operationLabel}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          <time dateTime={createdAt.toISOString()}>
                            {dateLabel}
                          </time>
                          {" · "}
                          {t("items", { count: entry.items.length })}
                        </span>
                      </summary>
                      <div className="border-t border-border px-3 py-3">
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {t("preview")}
                        </p>
                        {entry.items.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            {t("emptySnapshot")}
                          </p>
                        ) : (
                          <ul className="max-h-48 overflow-y-auto pe-2 text-sm">
                            {entry.items.map((item) => {
                              const amount = describeQuantity(item, locale);
                              return (
                                <li
                                  key={item.id}
                                  className="border-b border-border/60 py-1.5 last:border-0"
                                >
                                  {amount ? (
                                    <span className="font-semibold">
                                      {amount}{" "}
                                    </span>
                                  ) : null}
                                  {item.item}
                                  {item.checked ? (
                                    <span className="ms-2 text-xs text-muted-foreground">
                                      {t("completed")}
                                    </span>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        <div className="mt-3 flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={disabled}
                            aria-label={t("restoreNamed", {
                              operation: operationLabel,
                              date: dateLabel,
                            })}
                            onClick={() => onRestore(entry)}
                          >
                            <RotateCcw aria-hidden="true" />
                            {t("restore")}
                          </Button>
                        </div>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </details>
    </section>
  );
}
