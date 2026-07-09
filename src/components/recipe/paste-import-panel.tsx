"use client";

import * as React from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { friendlyError } from "~/lib/error-copy";
import { importRecipeTextAction } from "~/server/recipes/actions";
import { type ImportedRecipe } from "~/server/recipes/import";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";

/**
 * "Paste text" import tab (#370). Split into its own module so the recipe
 * editor can `next/dynamic` it — keeping the parser-adjacent UI out of the
 * /recipes/[id]/edit first-load JS budget.
 */
export function PasteImportPanel({
  onImported,
}: {
  onImported: (recipe: ImportedRecipe) => void;
}) {
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
            ? `Imported “${res.recipe.title}”. Review the details, then save.`
            : "Imported the recipe. Review the details, then save.",
        );
        setPasteText("");
      } else {
        toast.error(friendlyError(res.error));
      }
    } catch {
      toast.error("Something went wrong reading that text.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <p className="mt-3 text-sm text-muted-foreground">
        Paste a recipe as plain text — a message from a relative, a typed note —
        and we&apos;ll structure it for you to review.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <Textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder={
            "Grandma's Marinara\n\nIngredients\n2 cups crushed tomatoes\n1 clove garlic, minced\n\nInstructions\n1. Warm the oil.\n2. Add garlic and simmer."
          }
          rows={6}
          disabled={importing}
          aria-label="Recipe text to import"
        />
        <Button
          type="button"
          onClick={() => void handlePasteImport()}
          disabled={importing || !pasteText.trim()}
          className="shrink-0 self-start"
        >
          {importing ? <Loader2 className="animate-spin" /> : <Download />}
          {importing ? "Reading…" : "Use this text"}
        </Button>
      </div>
    </>
  );
}

export default PasteImportPanel;
