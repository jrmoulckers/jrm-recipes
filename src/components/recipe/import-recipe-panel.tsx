"use client";

import * as React from "react";
import { Download, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { friendlyError } from "~/lib/error-copy";
import { importRecipeFromUrlAction } from "~/server/recipes/actions";
import { type ImportedRecipe } from "~/server/recipes/import";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { PasteImportPanel } from "~/components/recipe/paste-import-panel";

/**
 * "Start from an existing recipe" import affordance — create mode only (#294,
 * #370). Extracted into its own module so the editor can `next/dynamic` it,
 * keeping the URL + paste import UI out of the recipe editor's first-load JS
 * (it never renders on the budget-tracked /recipes/[id]/edit route).
 */
export function ImportRecipePanel({
  onImported,
  urlLabel,
  initialUrl,
}: {
  onImported: (recipe: ImportedRecipe) => void;
  urlLabel: string;
  /** A URL shared into the PWA to pre-fill and auto-import on mount (#50/#55). */
  initialUrl?: string;
}) {
  const [importUrl, setImportUrl] = React.useState(initialUrl ?? "");
  const [importing, setImporting] = React.useState(false);
  // "Import from a link" vs. "Paste text" (#370).
  const [importMode, setImportMode] = React.useState<"url" | "text">("url");

  const onImportedRef = React.useRef(onImported);
  onImportedRef.current = onImported;

  const runImport = React.useCallback(async (rawUrl: string) => {
    const url = rawUrl.trim();
    if (!url) return;
    setImporting(true);
    try {
      const res = await importRecipeFromUrlAction(url);
      if (res.ok) {
        onImportedRef.current(res.recipe);
        toast.success(
          res.recipe.title
            ? `Imported “${res.recipe.title}”. Review the details, then save.`
            : "Imported the recipe. Review the details, then save.",
        );
        setImportUrl("");
      } else {
        toast.error(friendlyError(res.error));
      }
    } catch {
      toast.error("Something went wrong importing that link.");
    } finally {
      setImporting(false);
    }
  }, []);

  async function handleImport() {
    await runImport(importUrl);
  }

  // A recipe URL shared into the PWA (Web Share Target, #55) arrives pre-filled;
  // kick off the import automatically so the share flow lands on filled fields.
  const autoImportedRef = React.useRef(false);
  React.useEffect(() => {
    const url = initialUrl?.trim();
    if (!url || autoImportedRef.current) return;
    autoImportedRef.current = true;
    void runImport(url);
  }, [initialUrl, runImport]);

  return (
    <section className="rounded-xl border border-border bg-muted/40 p-4">
      <div className="flex items-center gap-2">
        <Link2 className="size-4 text-primary" />
        <h2 className="font-display text-base font-semibold">
          Start from an existing recipe
        </h2>
      </div>
      <div className="mt-3 flex gap-2" role="tablist" aria-label="Import method">
        <Button
          type="button"
          size="sm"
          variant={importMode === "url" ? "default" : "outline"}
          role="tab"
          aria-selected={importMode === "url"}
          onClick={() => setImportMode("url")}
        >
          Import from a link
        </Button>
        <Button
          type="button"
          size="sm"
          variant={importMode === "text" ? "default" : "outline"}
          role="tab"
          aria-selected={importMode === "text"}
          onClick={() => setImportMode("text")}
        >
          Paste text
        </Button>
      </div>

      {importMode === "url" ? (
        <>
          <p className="mt-3 text-sm text-muted-foreground">
            Paste a recipe URL and we&apos;ll fill in the details for you to
            review.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input
              type="url"
              inputMode="url"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleImport();
                }
              }}
              placeholder="https://example.com/best-marinara"
              disabled={importing}
              aria-label={urlLabel}
            />
            <Button
              type="button"
              onClick={() => void handleImport()}
              disabled={importing || !importUrl.trim()}
              className="shrink-0"
            >
              {importing ? <Loader2 className="animate-spin" /> : <Download />}
              {importing ? "Importing…" : "Import"}
            </Button>
          </div>
        </>
      ) : (
        <PasteImportPanel onImported={onImported} />
      )}
    </section>
  );
}

export default ImportRecipePanel;
