"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, CalendarDays, Link2, Printer, Repeat } from "lucide-react";
import { toast } from "sonner";

import { brand } from "~/config/brand";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import type { WeekMenuDay } from "~/lib/week-menu";

const printStyles = `
@media print {
  @page {
    size: A4;
    margin: 0.6in;
  }

  html,
  body {
    background: white !important;
  }

  body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .heirloom-menu-root {
    background: white !important;
    color: black !important;
  }

  .heirloom-menu-document {
    border: 0 !important;
    box-shadow: none !important;
    margin: 0 !important;
    max-width: none !important;
    padding: 0 !important;
    width: 100% !important;
  }

  .heirloom-menu-day {
    break-inside: avoid;
    page-break-inside: avoid;
  }
}
`;

export function WeekMenuPrintView({
  weekLabel,
  days,
  backHref,
}: {
  weekLabel: string;
  days: WeekMenuDay[];
  backHref: Route;
}) {
  function copyLink() {
    const url = typeof window === "undefined" ? "" : window.location.href;
    if (!url) return;
    void navigator.clipboard
      .writeText(url)
      .then(() => toast.success("Link copied to clipboard"))
      .catch(() => toast.error("Couldn't copy the link"));
  }

  return (
    <div className="heirloom-menu-root min-h-dvh bg-muted/30 text-foreground print:bg-white print:text-black">
      <style>{printStyles}</style>

      <div className="border-b border-border bg-background print:hidden">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button asChild variant="ghost" size="sm" className="-ml-2">
              <Link href={backHref}>
                <ArrowLeft /> Back
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="truncate font-display text-xl font-bold">
                Post on the fridge
              </h1>
              <p className="truncate text-sm text-muted-foreground">
                {weekLabel}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => window.print()}
              className="shrink-0"
            >
              <Printer /> Print / Save PDF
            </Button>
            <Button type="button" variant="outline" onClick={copyLink}>
              <Link2 /> Copy link
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <article className="heirloom-menu-document mx-auto max-w-2xl rounded-2xl border border-border bg-card p-8 shadow-token print:rounded-none print:border-0 print:p-0 print:shadow-none">
          <header className="flex flex-col items-center gap-1 border-b border-border pb-5 text-center">
            <span className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.2em] text-primary">
              <CalendarDays className="size-4" aria-hidden /> {brand.name}
            </span>
            <h2 className="font-display text-3xl font-bold tracking-tight">
              This week&rsquo;s dinners
            </h2>
            <p className="text-muted-foreground">{weekLabel}</p>
          </header>

          <ol className="divide-y divide-border">
            {days.map((day) => (
              <li
                key={day.dateParam}
                className="heirloom-menu-day flex items-baseline gap-4 py-3.5"
              >
                <div className="w-28 shrink-0">
                  <p
                    className={cn(
                      "font-display text-lg font-semibold leading-tight",
                      day.isToday && "text-primary",
                    )}
                  >
                    {day.weekday}
                  </p>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {day.date}
                  </p>
                </div>

                <div className="flex-1">
                  {day.dinners.length === 0 ? (
                    <p className="text-muted-foreground">&mdash;</p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {day.dinners.map((dinner, index) => (
                        <li
                          key={`${day.dateParam}-${index}`}
                          className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
                        >
                          <span
                            className={cn(
                              "text-base font-medium",
                              dinner.leftovers &&
                                "inline-flex items-center gap-1 italic text-muted-foreground",
                            )}
                          >
                            {dinner.leftovers && (
                              <Repeat
                                className="size-3.5 shrink-0"
                                aria-hidden
                              />
                            )}
                            {dinner.title}
                          </span>
                          {dinner.timeLabel && (
                            <span className="text-sm text-muted-foreground">
                              · {dinner.timeLabel}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <footer className="mt-6 border-t border-border pt-4 text-center text-xs text-muted-foreground">
            {brand.name} · {brand.tagline}
          </footer>
        </article>
      </div>
    </div>
  );
}
