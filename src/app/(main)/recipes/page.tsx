import { type Metadata } from "next";
import Link from "next/link";
import { ChefHat, UtensilsCrossed } from "lucide-react";

import { Button } from "~/components/ui/button";

export const metadata: Metadata = { title: "Recipes" };

export default function RecipesPage() {
  return (
    <div className="container py-16">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
        <span className="inline-flex size-16 items-center justify-center rounded-2xl bg-primary/12 text-primary">
          <UtensilsCrossed className="size-7" />
        </span>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Your recipes
        </h1>
        <p className="text-muted-foreground">
          This is where your family cookbook will live. The recipe library is
          coming together — start by adding your first dish.
        </p>
        <Button asChild size="lg">
          <Link href="/recipes/new">
            <ChefHat /> New recipe
          </Link>
        </Button>
      </div>
    </div>
  );
}
