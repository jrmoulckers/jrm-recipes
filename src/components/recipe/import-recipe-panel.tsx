"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Download, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { friendlyError } from "~/lib/error-copy";
import { importRecipeFromUrlAction } from "~/server/recipes/actions";
import { type ImportedRecipe } from "~/server/recipes/import";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { PasteImportPanel } from "~/components/recipe/paste-import-panel";

/**
 * "Import a recipe" import affordance. Create mode only (#294,
 * #370). Extracted into its own module so the editor can `next/dynamic` it,
 * keeping the URL + paste import UI out of the recipe editor's first-load JS
 * (it never renders on the budget-tracked /recipes/[cook]/[recipe]/edit route).
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
  const t = useTranslations("recipe");
  const [importUrl, setImportUrl] = React.useState(initialUrl ?? "");
  const [importing, setImporting] = React.useState(false);
  // "Import from a link" vs. "Paste text" (#370).
  const [importMode, setImportMode] = React.useState<"url" | "text">("url");

  const onImportedRef = React.useRef(onImported);
  onImportedRef.current = onImported;

  const runImport = React.useCallback(
    async (rawUrl: string) => {
      const url = rawUrl.trim();
      if (!url) return;
      setImporting(true);
      try {
        const res = await importRecipeFromUrlAction(url);
        if (res.ok) {
          onImportedRef.current(res.recipe);
          toast.success(
            res.recipe.title
              ? t("import.toast.importedNamed", { title: res.recipe.title })
              : t("import.toast.imported"),
          );
          setImportUrl("");
        } else {
          toast.error(friendlyError(res.error));
        }
      } catch {
        toast.error(t("import.toast.linkError"));
      } finally {
        setImporting(false);
      }
    },
    [t],
  );

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
          {t("import.title")}
        </h2>
      </div>
      <div
        className="mt-3 flex gap-2"
        role="tablist"
        aria-label={t("import.methodAria")}
      >
        <Button
          type="button"
          size="sm"
          variant={importMode === "url" ? "default" : "outline"}
          role="tab"
          aria-selected={importMode === "url"}
          onClick={() => setImportMode("url")}
        >
          {t("import.fromLink")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={importMode === "text" ? "default" : "outline"}
          role="tab"
          aria-selected={importMode === "text"}
          onClick={() => setImportMode("text")}
        >
          {t("import.pasteText")}
        </Button>
      </div>

      {importMode === "url" ? (
        <>
          <p className="mt-3 text-sm text-muted-foreground">
            {t("import.urlHelp")}
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
              {importing ? t("import.importing") : t("import.import")}
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
