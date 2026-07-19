"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Check, Languages } from "lucide-react";

import {
  SUPPORTED_LOCALES,
  LOCALE_ENDONYMS,
  localeDirection,
  type Locale,
} from "~/config/i18n";
import { writeLocaleCookie } from "~/lib/locale-cookie";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

/**
 * Language menu listing every {@link SUPPORTED_LOCALES} by its native endonym.
 *
 * Selection persists the {@link writeLocaleCookie NEXT_LOCALE cookie} and calls
 * `router.refresh()` so the server re-renders in the chosen language — including
 * the `<html lang/dir>` set from the cookie in `layout.tsx`, giving a no-flash
 * switch. (URL-prefixed locale routing is deferred to #230; this cookie-based
 * switch is the lightweight equivalent.) The active locale comes from
 * `useLocale()`, which is correct during SSR too, so the current language is
 * checked on first paint.
 */
export function LocaleSwitcher({ label }: { label?: string } = {}) {
  const t = useTranslations("localeSwitcher");
  const activeLocale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  function selectLocale(next: Locale) {
    if (next === activeLocale) return;
    writeLocaleCookie(next);
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {label ? (
          <Button
            variant="ghost"
            disabled={isPending}
            className="h-11 w-full justify-start gap-3 px-2 font-medium"
          >
            <Languages className="size-5" />
            {label}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="icon"
            aria-label={t("trigger")}
            disabled={isPending}
          >
            <Languages className="size-5" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>{t("label")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={activeLocale}
          onValueChange={(value) => selectLocale(value as Locale)}
          aria-label={t("label")}
          className="grid gap-1 p-1"
        >
          {SUPPORTED_LOCALES.map((locale) => {
            const active = locale === activeLocale;
            return (
              <DropdownMenuRadioItem
                key={locale}
                value={locale}
                onSelect={(event) => event.preventDefault()}
                className={cn(
                  "gap-2 border border-transparent hover:bg-muted",
                  active && "border-border bg-muted",
                )}
              >
                <span
                  dir={localeDirection(locale)}
                  className="min-w-0 flex-1 text-sm font-medium"
                >
                  {LOCALE_ENDONYMS[locale]}
                </span>
                {active && <Check className="size-3.5 text-primary" />}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
