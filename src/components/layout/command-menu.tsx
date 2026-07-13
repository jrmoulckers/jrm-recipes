"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CornerDownLeft, Search, UtensilsCrossed } from "lucide-react";

import { cn } from "~/lib/utils";
import { primaryNav } from "~/config/nav";
import { recipeSearchToQueryString } from "~/server/recipes/search";
import { pathnameWithQuery } from "~/lib/routes";
import { filterNavCommands, wrapIndex } from "~/lib/command-menu";
import { CloudinaryImage } from "~/components/ui/cloudinary-image";
import { OVERLAY_SURFACE } from "~/components/ui/overlay-surface";
import type { CommandRecipeResult } from "~/app/api/recipes/search/route";

/** Debounce before hitting the recipe search API as the user types. */
const SEARCH_DEBOUNCE_MS = 200;
/** Don't query the API for trivially short strings. */
const MIN_QUERY_LENGTH = 2;

type Command =
  | {
      index: number;
      group: "nav";
      label: string;
      href: string;
      labelKey: string;
    }
  | { index: number; group: "recipe"; kind: "all"; label: string }
  | {
      index: number;
      group: "recipe";
      kind: "recipe";
      recipe: CommandRecipeResult;
    };

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const source = `${navigator.platform} ${navigator.userAgent}`;
  return /mac|iphone|ipad|ipod/i.test(source);
}

/**
 * Global search + ⌘K command palette (issue #74). Renders the header search
 * affordances (a desktop input-styled button and a mobile search icon) plus the
 * palette overlay itself. ⌘K / Ctrl-K toggles it from anywhere; Escape and the
 * backdrop close it (Radix Dialog owns the focus trap + modal semantics). The
 * option list is a keyboard-navigable combobox/listbox: it lists primary
 * destinations and live recipe matches, and Enter on the "Search all recipes"
 * row hands off to `/recipes?q=…` so results, SSR, and shareable URLs stay
 * consistent with the browse page.
 */
export function CommandMenu() {
  const router = useRouter();
  const t = useTranslations("search");
  const tNav = useTranslations("nav");

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<CommandRecipeResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [isMac, setIsMac] = React.useState(false);

  const listId = React.useId();
  const trimmed = query.trim();

  React.useEffect(() => setIsMac(isMacPlatform()), []);

  // ⌘K / Ctrl-K toggles the palette from anywhere in the app.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Reset transient state whenever the palette closes so it reopens clean.
  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setLoading(false);
      setActiveIndex(0);
    }
  }, [open]);

  // Debounced live recipe search. A per-request id guards against out-of-order
  // responses overwriting a newer query's results.
  React.useEffect(() => {
    if (!open) return;
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const handle = window.setTimeout(() => {
      fetch(`/api/recipes/search?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : { items: [] }))
        .then((data: { items?: CommandRecipeResult[] }) => {
          setResults(data.items ?? []);
          setLoading(false);
        })
        .catch((error: unknown) => {
          if ((error as { name?: string }).name !== "AbortError") {
            setResults([]);
            setLoading(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [open, trimmed]);

  const navItems = React.useMemo(
    () =>
      primaryNav.map((item) => ({
        labelKey: item.labelKey,
        label: tNav(item.labelKey),
        href: item.href,
        icon: item.icon,
      })),
    [tNav],
  );

  const navMatches = React.useMemo(
    () => filterNavCommands(navItems, query),
    [navItems, query],
  );

  // Flat, ordered command list — the source of truth for arrow-key navigation.
  // Render order (Navigate, then Recipes) mirrors these indexes exactly.
  const commands = React.useMemo<Command[]>(() => {
    const out: Command[] = [];
    let index = 0;
    for (const item of navMatches) {
      out.push({
        index: index++,
        group: "nav",
        label: item.label,
        href: item.href,
        labelKey: item.labelKey,
      });
    }
    if (trimmed.length > 0) {
      out.push({
        index: index++,
        group: "recipe",
        kind: "all",
        label: t("allResults", { q: trimmed }),
      });
    }
    for (const recipe of results) {
      out.push({ index: index++, group: "recipe", kind: "recipe", recipe });
    }
    return out;
  }, [navMatches, results, trimmed, t]);

  // Keep the active index in range as the list grows/shrinks with the query.
  React.useEffect(() => {
    setActiveIndex((prev) =>
      commands.length === 0 ? 0 : Math.min(prev, commands.length - 1),
    );
  }, [commands.length]);

  const optionId = (index: number) => `${listId}-option-${index}`;

  // Scroll the active option into view on keyboard movement.
  React.useEffect(() => {
    if (!open) return;
    const el = document.getElementById(optionId(activeIndex));
    el?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, open]);

  const run = React.useCallback(
    (command: Command | undefined) => {
      if (!command) return;
      if (command.group === "nav") {
        router.push(pathnameWithQuery(command.href));
      } else if (command.kind === "all") {
        router.push(
          pathnameWithQuery(
            "/recipes",
            recipeSearchToQueryString({ q: trimmed }),
          ),
        );
      } else {
        router.push(pathnameWithQuery(`/recipes/${command.recipe.slug}`));
      }
      setOpen(false);
    },
    [router, trimmed],
  );

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => wrapIndex(prev + 1, commands.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => wrapIndex(prev - 1, commands.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(commands[activeIndex]);
    }
  };

  const navCommands = commands.filter(
    (c): c is Extract<Command, { group: "nav" }> => c.group === "nav",
  );
  const recipeCommands = commands.filter(
    (c): c is Extract<Command, { group: "recipe" }> => c.group === "recipe",
  );
  const showEmpty =
    trimmed.length >= MIN_QUERY_LENGTH &&
    !loading &&
    navMatches.length === 0 &&
    results.length === 0;

  const activeDescendant =
    commands.length > 0 && activeIndex >= 0 ? optionId(activeIndex) : undefined;

  return (
    <>
      {/* Desktop: an input-styled button so the header reads like it has a real
          search field, without shipping the palette's client JS inline. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("triggerAria")}
        aria-keyshortcuts="Meta+K Control+K"
        className="hidden h-9 min-w-44 items-center gap-2 rounded-lg border border-input bg-background/60 px-3 text-sm text-muted-foreground shadow-token-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:inline-flex"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 text-start">{t("trigger")}</span>
        <kbd
          suppressHydrationWarning
          className="pointer-events-none hidden rounded border border-border bg-muted px-1.5 font-sans text-[0.7rem] font-medium text-muted-foreground lg:inline-block"
        >
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>

      {/* Mobile: an icon-only trigger that opens the same palette. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("triggerAria")}
        className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:hidden"
      >
        <Search className="size-5" aria-hidden />
      </button>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className={cn(
              "fixed inset-x-4 top-[10vh] z-50 mx-auto flex max-h-[70vh] w-auto max-w-xl flex-col overflow-hidden p-0",
              OVERLAY_SURFACE,
              "data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in",
            )}
          >
            <DialogPrimitive.Title className="sr-only">
              {t("title")}
            </DialogPrimitive.Title>

            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <input
                type="text"
                role="combobox"
                aria-expanded
                aria-controls={listId}
                aria-activedescendant={activeDescendant}
                aria-autocomplete="list"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={onInputKeyDown}
                placeholder={t("placeholder")}
                className="h-12 w-full border-0 bg-transparent text-base outline-none placeholder:text-muted-foreground focus:outline-none focus-visible:ring-0 md:text-sm"
              />
            </div>

            <ul
              id={listId}
              role="listbox"
              aria-label={t("title")}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5"
            >
              {navCommands.length > 0 && (
                <li role="presentation">
                  <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    {t("navHeading")}
                  </p>
                  <ul role="presentation">
                    {navCommands.map((command) => {
                      const item = navItems.find(
                        (n) => n.labelKey === command.labelKey,
                      );
                      const Icon = item?.icon ?? Search;
                      const active = command.index === activeIndex;
                      return (
                        <li
                          key={`nav-${command.labelKey}`}
                          id={optionId(command.index)}
                          role="option"
                          aria-selected={active}
                          onMouseMove={() => setActiveIndex(command.index)}
                          onClick={() => run(command)}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm",
                            active
                              ? "bg-muted text-foreground"
                              : "text-foreground/90",
                          )}
                        >
                          <Icon
                            className="size-4 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                          <span className="flex-1 truncate">
                            {command.label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              )}

              {(recipeCommands.length > 0 || loading || showEmpty) && (
                <li role="presentation">
                  <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    {t("recipesHeading")}
                  </p>
                  <ul role="presentation">
                    {recipeCommands.map((command) => {
                      const active = command.index === activeIndex;
                      if (command.kind === "all") {
                        return (
                          <li
                            key="all-results"
                            id={optionId(command.index)}
                            role="option"
                            aria-selected={active}
                            onMouseMove={() => setActiveIndex(command.index)}
                            onClick={() => run(command)}
                            className={cn(
                              "flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm",
                              active
                                ? "bg-muted text-foreground"
                                : "text-foreground/90",
                            )}
                          >
                            <Search
                              className="size-4 shrink-0 text-muted-foreground"
                              aria-hidden
                            />
                            <span className="flex-1 truncate">
                              {command.label}
                            </span>
                            <CornerDownLeft
                              className="size-3.5 shrink-0 text-muted-foreground"
                              aria-hidden
                            />
                          </li>
                        );
                      }
                      const { recipe } = command;
                      return (
                        <li
                          key={`recipe-${recipe.id}`}
                          id={optionId(command.index)}
                          role="option"
                          aria-selected={active}
                          onMouseMove={() => setActiveIndex(command.index)}
                          onClick={() => run(command)}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm",
                            active
                              ? "bg-muted text-foreground"
                              : "text-foreground/90",
                          )}
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                            {recipe.imageUrl ? (
                              <CloudinaryImage
                                src={recipe.imageUrl}
                                alt=""
                                width={36}
                                height={36}
                                className="size-9 object-cover"
                              />
                            ) : (
                              <UtensilsCrossed
                                className="size-4 text-muted-foreground"
                                aria-hidden
                              />
                            )}
                          </span>
                          <span className="flex-1 truncate">
                            {recipe.title}
                          </span>
                        </li>
                      );
                    })}
                    {loading && recipeCommands.length <= 1 && (
                      <li
                        role="presentation"
                        className="px-2 py-2 text-sm text-muted-foreground"
                      >
                        {t("loading")}
                      </li>
                    )}
                  </ul>
                </li>
              )}

              {showEmpty && (
                <li
                  role="presentation"
                  className="px-2 py-6 text-center text-sm text-muted-foreground"
                >
                  {t("empty", { q: trimmed })}
                </li>
              )}
            </ul>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
