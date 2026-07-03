"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  Clipboard,
  Download,
  FileText,
  Link2,
  Printer,
  Share2,
} from "lucide-react";
import { toast } from "sonner";

import { brand } from "~/config/brand";
import { cn } from "~/lib/utils";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import type {
  PrintRecipe,
  PrintRecipeIngredient,
  PrintRecipeStep,
} from "~/components/print/types";
import {
  formatIngredientAmount,
  formatIngredientLine,
  formatRecipeMeta,
  formatStepLine,
  formatTimerLabel,
  groupIngredients,
  groupSteps,
  recipeDownloadFilename,
  recipeUrl,
  serializeRecipeMarkdown,
  serializeRecipePlainText,
  serializeShareCaption,
} from "~/components/print/export";

const FORMAT_ORDER = ["full", "compact", "card-4x6", "card-3x5"] as const;

type PrintFormat = (typeof FORMAT_ORDER)[number];

type FormatDetails = {
  label: string;
  hint: string;
  className: string;
  pageSize: string;
  pageMargin: string;
};

const FORMAT_DETAILS: Record<PrintFormat, FormatDetails> = {
  full: {
    label: "Full page",
    hint: "Generous recipe sheet with image, notes, and source.",
    className: "print-format-full",
    pageSize: "auto",
    pageMargin: "0.55in",
  },
  compact: {
    label: "Two-column",
    hint: "Ingredients sidebar with flowing method.",
    className: "print-format-compact",
    pageSize: "auto",
    pageMargin: "0.45in",
  },
  "card-4x6": {
    label: "4×6 card",
    hint: "Index-card paper size with tight typography.",
    className: "print-format-card-4x6",
    pageSize: "4in 6in",
    pageMargin: "0.18in",
  },
  "card-3x5": {
    label: "3×5 card",
    hint: "Smallest card layout for recipe boxes.",
    className: "print-format-card-3x5",
    pageSize: "3in 5in",
    pageMargin: "0.14in",
  },
};

function printStyles(format: FormatDetails): string {
  return `
@media print {
  @page {
    size: ${format.pageSize};
    margin: ${format.pageMargin};
  }

  html,
  body {
    background: white !important;
  }

  body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .heirloom-print-root {
    background: white !important;
    color: black !important;
  }

  .heirloom-print-document {
    border: 0 !important;
    box-shadow: none !important;
    margin: 0 !important;
    max-width: none !important;
    min-height: 0 !important;
    padding: 0 !important;
    width: 100% !important;
  }

  .heirloom-print-section,
  .heirloom-print-ingredient,
  .heirloom-print-step {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .print-format-compact .print-compact-layout {
    display: grid !important;
    grid-template-columns: 2.15in minmax(0, 1fr);
    gap: 0.32in;
    align-items: start;
  }

  .print-format-card-4x6 .heirloom-print-document,
  .print-format-card-3x5 .heirloom-print-document {
    font-size: 8.5pt;
    line-height: 1.24;
  }

  .print-format-card-4x6 .print-card-body {
    display: grid !important;
    grid-template-columns: 1.35in minmax(0, 1fr);
    gap: 0.16in;
    align-items: start;
  }

  .print-format-card-3x5 .heirloom-print-document {
    font-size: 7.4pt;
    line-height: 1.18;
  }

  .print-format-card-3x5 .print-card-body {
    display: block !important;
  }

  .print-format-card-3x5 .print-card-method {
    margin-top: 0.1in;
  }
}
`;
}

function previewClass(format: PrintFormat): string {
  if (format === "card-4x6") return "max-w-[4in]";
  if (format === "card-3x5") return "max-w-[3in]";
  if (format === "compact") return "max-w-6xl";
  return "max-w-5xl";
}

function SourceBlock({
  recipe,
  url,
  className,
}: {
  recipe: PrintRecipe;
  url: string;
  className?: string;
}) {
  if (!recipe.sourceName && !recipe.sourceUrl) {
    return (
      <footer
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-xs text-muted-foreground print:border-black/30 print:text-black",
          className,
        )}
      >
        <span>{brand.name}</span>
        <span>{url}</span>
      </footer>
    );
  }

  return (
    <footer
      className={cn(
        "flex flex-col gap-1 border-t border-border pt-4 text-sm text-muted-foreground print:border-black/30 print:text-black",
        className,
      )}
    >
      <p>
        <span className="font-medium text-foreground print:text-black">
          Source:
        </span>{" "}
        {recipe.sourceUrl ? (
          <a
            href={recipe.sourceUrl}
            className="text-primary underline-offset-4 hover:underline print:text-black"
          >
            {recipe.sourceName ?? recipe.sourceUrl}
          </a>
        ) : (
          recipe.sourceName
        )}
      </p>
      <p className="text-xs">
        {brand.name} · {brand.tagline} · {url}
      </p>
    </footer>
  );
}

function MetaPills({ recipe }: { recipe: PrintRecipe }) {
  const meta = formatRecipeMeta(recipe);

  if (meta.length === 0) return null;

  return (
    <dl className="flex flex-wrap gap-2 text-sm text-muted-foreground print:gap-x-3 print:gap-y-1 print:text-black">
      {meta.map((item) => (
        <div
          key={item}
          className="rounded-full border border-border bg-muted px-3 py-1 print:border-black/40 print:bg-white print:px-0 print:py-0"
        >
          <dt className="sr-only">Recipe detail</dt>
          <dd>{item}</dd>
        </div>
      ))}
    </dl>
  );
}

function TagRow({ recipe }: { recipe: PrintRecipe }) {
  if (recipe.tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      {recipe.tags.map(({ tag }) => (
        <Badge key={tag.name} variant="muted">
          #{tag.name}
        </Badge>
      ))}
    </div>
  );
}

function IngredientsList({
  ingredients,
  dense = false,
}: {
  ingredients: PrintRecipeIngredient[];
  dense?: boolean;
}) {
  if (ingredients.length === 0) {
    return (
      <p className="text-muted-foreground print:text-black">
        No ingredients listed.
      </p>
    );
  }

  return (
    <div className={cn("space-y-4", dense && "space-y-2")}>
      {groupIngredients(ingredients).map((group) => (
        <section
          key={group.section ?? "main"}
          className="heirloom-print-section break-inside-avoid"
        >
          {group.section && (
            <h3
              className={cn(
                "mb-2 font-display text-sm font-semibold text-muted-foreground print:text-black",
                dense && "mb-1 text-xs",
              )}
            >
              {group.section}
            </h3>
          )}
          <ul className={cn("space-y-2", dense && "space-y-1")}>
            {group.items.map((ingredient) => {
              const amount = formatIngredientAmount(ingredient);

              return (
                <li
                  key={ingredient.id}
                  className={cn(
                    "heirloom-print-ingredient rounded-lg border border-border bg-card px-3 py-2 print:border-0 print:border-b print:border-black/20 print:bg-white print:px-0 print:py-1",
                    dense &&
                      "rounded-none border-0 bg-transparent px-0 py-0 text-sm",
                  )}
                >
                  <span className="font-medium tabular-nums text-foreground print:text-black">
                    {amount}
                    {amount ? " " : ""}
                  </span>
                  <span>{ingredient.item}</span>
                  {ingredient.note && (
                    <span className="text-muted-foreground print:text-black">
                      {" "}
                      — {ingredient.note}
                    </span>
                  )}
                  {ingredient.optional && (
                    <span className="ml-1 text-xs text-muted-foreground print:text-black">
                      optional
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function StepsList({
  steps,
  dense = false,
}: {
  steps: PrintRecipeStep[];
  dense?: boolean;
}) {
  if (steps.length === 0) {
    return (
      <p className="text-muted-foreground print:text-black">No steps listed.</p>
    );
  }

  let stepNumber = 1;

  return (
    <div className={cn("space-y-5", dense && "space-y-2")}>
      {groupSteps(steps).map((group) => (
        <section
          key={group.section ?? "main"}
          className="heirloom-print-section break-inside-avoid"
        >
          {group.section && (
            <h3
              className={cn(
                "mb-2 font-display text-sm font-semibold text-muted-foreground print:text-black",
                dense && "mb-1 text-xs",
              )}
            >
              {group.section}
            </h3>
          )}
          <ol className={cn("space-y-4", dense && "space-y-2")}>
            {group.items.map((step) => {
              const currentStep = stepNumber;
              stepNumber += 1;

              return (
                <li
                  key={step.id}
                  className={cn(
                    "heirloom-print-step flex break-inside-avoid gap-3",
                    dense && "gap-2 text-sm",
                  )}
                >
                  <span
                    className={cn(
                      "bg-primary/12 flex size-8 shrink-0 items-center justify-center rounded-full font-display font-semibold text-primary print:size-auto print:min-w-5 print:bg-white print:text-black",
                      dense && "size-6 text-sm",
                    )}
                  >
                    {currentStep}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="leading-relaxed print:leading-snug">
                      {step.instruction}
                    </p>
                    {(step.timerSeconds != null ||
                      (step.techniques && step.techniques.length > 0)) && (
                      <p className="mt-1 text-xs text-muted-foreground print:text-black">
                        {[
                          step.timerSeconds != null
                            ? formatTimerLabel(step.timerSeconds)
                            : null,
                          step.techniques && step.techniques.length > 0
                            ? step.techniques.join(", ")
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

function FullPage({ recipe, url }: { recipe: PrintRecipe; url: string }) {
  return (
    <article className="space-y-8 print:space-y-5">
      <header className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] print:block">
        <div className="space-y-4">
          <p className="text-sm font-medium text-muted-foreground print:text-black">
            {brand.name} recipe sheet
          </p>
          <div className="space-y-3">
            <h1 className="max-w-3xl font-display text-4xl font-bold leading-tight tracking-tight text-foreground print:text-3xl print:text-black">
              {recipe.title}
            </h1>
            {recipe.description && (
              <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground print:text-base print:text-black">
                {recipe.description}
              </p>
            )}
          </div>
          <MetaPills recipe={recipe} />
          <TagRow recipe={recipe} />
        </div>

        {recipe.coverImageUrl && (
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-muted print:mb-4 print:max-h-[2.2in] print:rounded-none print:border-black/30">
            <Image
              src={recipe.coverImageUrl}
              alt=""
              fill
              sizes="(max-width: 1024px) 100vw, 18rem"
              className="object-cover"
            />
          </div>
        )}
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] print:grid-cols-2 print:gap-8">
        <section className="heirloom-print-section space-y-4">
          <h2 className="font-display text-2xl font-bold tracking-tight print:text-xl print:text-black">
            Ingredients
          </h2>
          <IngredientsList ingredients={recipe.ingredients} />
        </section>

        <section className="heirloom-print-section space-y-4">
          <h2 className="font-display text-2xl font-bold tracking-tight print:text-xl print:text-black">
            Method
          </h2>
          <StepsList steps={recipe.steps} />
        </section>
      </div>

      {recipe.notes && (
        <section className="heirloom-print-section rounded-2xl border border-border bg-card p-5 print:rounded-none print:border-black/30 print:bg-white print:p-0 print:pt-4">
          <h2 className="font-display text-xl font-bold print:text-lg print:text-black">
            Notes
          </h2>
          <p className="mt-2 whitespace-pre-line leading-relaxed text-muted-foreground print:text-black">
            {recipe.notes}
          </p>
        </section>
      )}

      <SourceBlock recipe={recipe} url={url} />
    </article>
  );
}

function CompactPage({ recipe, url }: { recipe: PrintRecipe; url: string }) {
  return (
    <article className="space-y-6 print:space-y-4">
      <header className="space-y-3 border-b border-border pb-5 print:border-black/30 print:pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground print:text-black">
            {brand.name}
          </p>
          <MetaPills recipe={recipe} />
        </div>
        <h1 className="max-w-4xl font-display text-4xl font-bold leading-tight tracking-tight print:text-2xl print:text-black">
          {recipe.title}
        </h1>
        {recipe.description && (
          <p className="max-w-3xl text-muted-foreground print:text-black">
            {recipe.description}
          </p>
        )}
      </header>

      <div className="print-compact-layout grid gap-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="space-y-5">
          <section className="heirloom-print-section space-y-3">
            <h2 className="font-display text-xl font-bold print:text-base print:text-black">
              Ingredients
            </h2>
            <IngredientsList ingredients={recipe.ingredients} dense />
          </section>

          {recipe.notes && (
            <section className="heirloom-print-section space-y-2 rounded-xl border border-border bg-card p-4 print:rounded-none print:border-black/30 print:bg-white print:p-0 print:pt-3">
              <h2 className="font-display text-lg font-bold print:text-sm print:text-black">
                Notes
              </h2>
              <p className="whitespace-pre-line text-sm text-muted-foreground print:text-black">
                {recipe.notes}
              </p>
            </section>
          )}
        </aside>

        <section className="heirloom-print-section space-y-4">
          <h2 className="font-display text-xl font-bold print:text-base print:text-black">
            Method
          </h2>
          <StepsList steps={recipe.steps} dense />
        </section>
      </div>

      <SourceBlock recipe={recipe} url={url} />
    </article>
  );
}

function IndexCard({ recipe, url }: { recipe: PrintRecipe; url: string }) {
  const meta = formatRecipeMeta(recipe);

  return (
    <article className="space-y-4 print:space-y-2">
      <header className="space-y-2 border-b border-border pb-3 print:border-black/30 print:pb-2">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground print:text-black">
          <span>{brand.name}</span>
          {recipe.author?.name && <span>By {recipe.author.name}</span>}
        </div>
        <h1 className="font-display text-2xl font-bold leading-tight tracking-tight print:text-[15pt] print:text-black">
          {recipe.title}
        </h1>
        {meta.length > 0 && (
          <p className="text-xs text-muted-foreground print:text-black">
            {meta.join(" · ")}
          </p>
        )}
      </header>

      <div className="print-card-body grid gap-4 sm:grid-cols-[0.9fr_1.1fr]">
        <section className="heirloom-print-section space-y-2">
          <h2 className="font-display text-sm font-bold print:text-[9pt] print:text-black">
            Ingredients
          </h2>
          {recipe.ingredients.length === 0 ? (
            <p className="text-xs text-muted-foreground print:text-black">
              No ingredients listed.
            </p>
          ) : (
            <ul className="space-y-1">
              {recipe.ingredients.map((ingredient) => (
                <li
                  key={ingredient.id}
                  className="heirloom-print-ingredient text-xs leading-snug print:text-[inherit]"
                >
                  {formatIngredientLine(ingredient)}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="print-card-method heirloom-print-section space-y-2">
          <h2 className="font-display text-sm font-bold print:text-[9pt] print:text-black">
            Method
          </h2>
          {recipe.steps.length === 0 ? (
            <p className="text-xs text-muted-foreground print:text-black">
              No steps listed.
            </p>
          ) : (
            <ol className="space-y-1">
              {recipe.steps.map((step, index) => (
                <li
                  key={step.id}
                  className="heirloom-print-step text-xs leading-snug print:text-[inherit]"
                >
                  <span className="font-semibold tabular-nums">
                    {index + 1}.
                  </span>{" "}
                  {formatStepLine(step)}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <footer className="border-t border-border pt-2 text-[0.7rem] text-muted-foreground print:border-black/30 print:text-black">
        {recipe.sourceName ?? brand.tagline} · {url}
      </footer>
    </article>
  );
}

export function PrintView({ recipe }: { recipe: PrintRecipe }) {
  const [format, setFormat] = React.useState<PrintFormat>("full");
  const [canNativeShare, setCanNativeShare] = React.useState(false);
  const activeFormat = FORMAT_DETAILS[format];
  const url = recipeUrl(recipe);

  React.useEffect(() => {
    setCanNativeShare(typeof navigator.share === "function");
  }, []);

  async function copyToClipboard(text: string, successMessage: string) {
    if (!navigator.clipboard) {
      toast.error("Clipboard is unavailable in this browser");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      toast.success(successMessage);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  async function handleNativeShare() {
    if (typeof navigator.share !== "function") {
      await copyToClipboard(url, "Link copied to clipboard");
      return;
    }

    try {
      await navigator.share({
        title: recipe.title,
        text: recipe.description ?? undefined,
        url,
      });
    } catch {
      // The user may dismiss the share sheet.
    }
  }

  function downloadText(contents: string, filename: string, type: string) {
    const blob = new Blob([contents], { type });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    toast.success(`Downloaded ${filename}`);
  }

  return (
    <div
      className={cn(
        "heirloom-print-root min-h-dvh bg-muted/30 text-foreground print:bg-white print:text-black",
        activeFormat.className,
      )}
    >
      <style>{printStyles(activeFormat)}</style>

      <div className="border-b border-border bg-background print:hidden">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Button asChild variant="ghost" size="sm" className="-ml-2">
                <Link href={`/recipes/${recipe.slug}`}>
                  <ArrowLeft /> Back
                </Link>
              </Button>
              <div className="min-w-0">
                <h1 className="truncate font-display text-xl font-bold">
                  Print & share
                </h1>
                <p className="truncate text-sm text-muted-foreground">
                  {recipe.title}
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
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void copyToClipboard(url, "Link copied to clipboard");
                }}
              >
                <Link2 /> Copy link
              </Button>
              {canNativeShare && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void handleNativeShare();
                  }}
                >
                  <Share2 /> Share
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline">
                    <FileText /> Export <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Copy</DropdownMenuLabel>
                  <DropdownMenuItem
                    onSelect={() => {
                      void copyToClipboard(
                        serializeRecipePlainText(recipe),
                        "Plain text copied",
                      );
                    }}
                  >
                    <Clipboard /> Copy as plain text
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      void copyToClipboard(
                        serializeRecipeMarkdown(recipe),
                        "Markdown copied",
                      );
                    }}
                  >
                    <Clipboard /> Copy as Markdown
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      void copyToClipboard(
                        serializeShareCaption(recipe),
                        "Share caption copied",
                      );
                    }}
                  >
                    <Share2 /> Copy share caption
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Download</DropdownMenuLabel>
                  <DropdownMenuItem
                    onSelect={() =>
                      downloadText(
                        serializeRecipeMarkdown(recipe),
                        recipeDownloadFilename(recipe, "md"),
                        "text/markdown;charset=utf-8",
                      )
                    }
                  >
                    <Download /> Download .md
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      downloadText(
                        serializeRecipePlainText(recipe),
                        recipeDownloadFilename(recipe, "txt"),
                        "text/plain;charset=utf-8",
                      )
                    }
                  >
                    <Download /> Download .txt
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div
              role="group"
              aria-label="Print format"
              className="flex h-auto flex-wrap justify-start gap-1 rounded-xl bg-muted p-1 text-muted-foreground"
            >
              {FORMAT_ORDER.map((formatId) => (
                <button
                  key={formatId}
                  type="button"
                  aria-pressed={format === formatId}
                  onClick={() => {
                    setFormat(formatId);
                  }}
                  className={cn(
                    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    format === formatId
                      ? "bg-card text-foreground shadow-token"
                      : "hover:text-foreground",
                  )}
                >
                  {FORMAT_DETAILS[formatId].label}
                </button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">{activeFormat.hint}</p>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 print:block print:max-w-none print:p-0">
        <div
          className={cn(
            "heirloom-print-document mx-auto rounded-3xl border border-border bg-card p-6 shadow-token-lg sm:p-8 print:bg-white print:text-black",
            previewClass(format),
          )}
        >
          {format === "full" && <FullPage recipe={recipe} url={url} />}
          {format === "compact" && <CompactPage recipe={recipe} url={url} />}
          {format === "card-4x6" && <IndexCard recipe={recipe} url={url} />}
          {format === "card-3x5" && <IndexCard recipe={recipe} url={url} />}
        </div>
      </main>
    </div>
  );
}
