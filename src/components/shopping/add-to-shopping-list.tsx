"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ListPlus, Loader2, ShoppingCart, Users } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "~/lib/error-copy";

import { addRecipeToShoppingListAction } from "~/server/shopping/actions";
import { isPantryStaple } from "~/lib/shopping-list";
import { useShoppingStore } from "~/lib/shopping-store";
import { useHousehold } from "~/components/household/household-provider";
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
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";

export type ShoppingRecipe = {
  id: string;
  title: string;
  servings: number | null;
  servingsNoun: string | null;
  ingredients: {
    item: string;
    quantity: number | null;
    quantityMax: number | null;
    unit: string | null;
    optional: boolean;
  }[];
};

export function AddToShoppingList({
  recipe,
  dbEnabled,
}: {
  recipe: ShoppingRecipe;
  dbEnabled: boolean;
}) {
  const router = useRouter();
  const household = useHousehold();
  const [open, setOpen] = React.useState(false);
  const [servings, setServings] = React.useState(
    household.size
      ? String(household.size)
      : recipe.servings
        ? String(recipe.servings)
        : "",
  );
  const [includeStaples, setIncludeStaples] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const addRecipe = useShoppingStore((s) => s.addRecipe);

  const noun = recipe.servingsNoun ?? "servings";

  function desiredServings(): number | undefined {
    const value = servings.trim();
    if (value === "") return undefined;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
  }

  const scaledToHousehold =
    household.size != null &&
    desiredServings() === household.size &&
    household.size !== recipe.servings;

  function added() {
    toast.success("Added to your shopping list", {
      action: { label: "View list", onClick: () => router.push("/shopping") },
    });
    setOpen(false);
  }

  function onConfirm() {
    const desired = desiredServings();

    if (!dbEnabled) {
      addRecipe({
        recipeId: recipe.id,
        servings: recipe.servings,
        desiredServings: desired,
        ingredients: includeStaples
          ? recipe.ingredients
          : recipe.ingredients.filter((ing) => !isPantryStaple(ing.item)),
      });
      added();
      return;
    }

    startTransition(async () => {
      const result = await addRecipeToShoppingListAction({
        recipeId: recipe.id,
        desiredServings: desired,
        includeStaples,
      });
      if (result.ok) added();
      else toast.error(friendlyError(result.error));
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button type="button" size="lg" variant="outline">
          <ShoppingCart /> Add to list
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <div className="mb-2 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShoppingCart className="size-5" aria-hidden="true" />
          </div>
          <DialogTitle>Add to shopping list</DialogTitle>
          <DialogDescription>
            Add the ingredients for {recipe.title} to your grocery list. Like
            items combine and quantities scale to the servings you choose.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="shop-servings">Servings to shop for</Label>
          <Input
            id="shop-servings"
            value={servings}
            onChange={(event) => setServings(event.target.value)}
            inputMode="numeric"
            placeholder={recipe.servings ? String(recipe.servings) : "4"}
            disabled={pending}
          />
          {recipe.servings ? (
            <p className="text-xs text-muted-foreground">
              This recipe makes {recipe.servings} {noun}. We&apos;ll scale the
              quantities to match.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              This recipe has no serving size, so quantities are added as-is.
            </p>
          )}
          {scaledToHousehold && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="size-3.5 text-primary" aria-hidden="true" />
              Scaled to your family of {household.size}.
            </p>
          )}
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/40 p-3">
          <div className="grid gap-1">
            <Label htmlFor="shop-staples" className="cursor-pointer">
              Include pantry staples
            </Label>
            <p className="text-xs text-muted-foreground">
              Off by default — we skip salt, oil, butter and common spices so
              your list is just what you need to buy.
            </p>
          </div>
          <Switch
            id="shop-staples"
            checked={includeStaples}
            onCheckedChange={setIncludeStaples}
            disabled={pending}
            aria-label="Include pantry staples like salt and oil"
          />
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" onClick={onConfirm} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <ListPlus />}
            {pending ? "Adding…" : "Add to list"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
