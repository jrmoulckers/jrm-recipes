"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { friendlyError } from "~/lib/error-copy";
import { importRecipeTextAction } from "~/server/recipes/actions";
import { type ImportedRecipe } from "~/server/recipes/import";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";

/**
 * "Paste text" import tab (#370). Split into its own module so the recipe
 * editor can `next/dynamic` it. Keeping the parser-adjacent UI out of the
 * /recipes/[id]/edit first-load JS budget.
 */
export function PasteImportPanel({
  onImported,
}: {
  onImported: (recipe: ImportedRecipe) => void;
}) {
  const t = useTranslations("recipe");
  const [pasteText, setPasteText] = React.useState("");
  const [importing, setImporting] = React.useState(false);

  async function handlePasteImport() {
    const text = pasteText.trim();
    if (!text) return;
    setImporting(true);
    try {
      const res = await importRecipeTextAction(text);
      if (res.ok) {
        onImported(res.recipe);
        toast.success(
          res.recipe.title
            ? t("import.toast.importedNamed", { title: res.recipe.title })
            : t("import.toast.imported"),
        );
        setPasteText("");
      } else {
        toast.error(friendlyError(res.error));
      }
    } catch {
      toast.error(t("import.toast.textError"));
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <p className="mt-3 text-sm text-muted-foreground">
        {t("import.textHelp")}
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <Textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder={t("import.textPlaceholder")}
          rows={6}
          disabled={importing}
          aria-label={t("import.textAria")}
        />
        <Button
          type="button"
          onClick={() => void handlePasteImport()}
          disabled={importing || !pasteText.trim()}
          className="shrink-0 self-start"
        >
          {importing ? <Loader2 className="animate-spin" /> : <Download />}
          {importing ? t("import.reading") : t("import.useText")}
        </Button>
      </div>
    </>
  );
}

export default PasteImportPanel;
