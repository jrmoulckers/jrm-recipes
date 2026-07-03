import { type Metadata } from "next";
import { PencilLine } from "lucide-react";

export const metadata: Metadata = { title: "New recipe" };

export default function NewRecipePage() {
  return (
    <div className="container py-16">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
        <span className="inline-flex size-16 items-center justify-center rounded-2xl bg-accent/15 text-accent-foreground">
          <PencilLine className="size-7" />
        </span>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Create a recipe
        </h1>
        <p className="text-muted-foreground">
          The dead-simple recipe editor is on its way — ingredients, steps,
          photos, and instant cook mode, all in one place.
        </p>
      </div>
    </div>
  );
}
