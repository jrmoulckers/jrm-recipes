import { type Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "~/components/ui/button";

export const metadata: Metadata = { title: "Recipe" };

export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="container py-16">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Recipe
        </h1>
        <p className="text-muted-foreground">
          The full recipe view — with cook mode, scaling, and print — is coming
          soon.
        </p>
        <p className="rounded-lg bg-muted px-3 py-1.5 font-mono text-xs text-muted-foreground">
          {id}
        </p>
        <Button asChild variant="outline">
          <Link href="/recipes">
            <ArrowLeft /> Back to recipes
          </Link>
        </Button>
      </div>
    </div>
  );
}
