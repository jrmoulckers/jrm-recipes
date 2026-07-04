import Link from "next/link";
import { GitFork } from "lucide-react";

export function RecipeLineage({
  parent,
  adaptations,
}: {
  parent: {
    slug: string;
    title: string;
    author?: { name: string | null } | null;
  } | null;
  adaptations: {
    slug: string;
    title: string;
    author?: { name: string | null } | null;
  }[];
}) {
  if (!parent && adaptations.length === 0) return null;

  return (
    <section
      className="rounded-xl border border-border bg-card p-4 shadow-token"
      aria-label="Recipe lineage"
    >
      <div className="flex flex-col gap-4">
        {parent && (
          <div className="flex gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <GitFork className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">
                Adapted from
              </p>
              <Link
                href={`/recipes/${parent.slug}`}
                className="font-display text-lg font-semibold leading-tight text-foreground underline-offset-4 hover:text-primary hover:underline"
              >
                {parent.title}
              </Link>
              {parent.author?.name && (
                <p className="mt-1 text-sm text-muted-foreground">
                  by {parent.author.name}
                </p>
              )}
            </div>
          </div>
        )}

        {adaptations.length > 0 && (
          <div className="border-t border-border pt-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <GitFork className="size-4 text-primary" aria-hidden="true" />
              Adaptations ({adaptations.length})
            </h3>
            <ul className="mt-3 grid gap-2">
              {adaptations.map((adaptation) => (
                <li key={adaptation.slug}>
                  <Link
                    href={`/recipes/${adaptation.slug}`}
                    className="group flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background px-3 py-2 text-sm transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium group-hover:text-primary">
                        {adaptation.title}
                      </span>
                      {adaptation.author?.name && (
                        <span className="block truncate text-xs text-muted-foreground">
                          by {adaptation.author.name}
                        </span>
                      )}
                    </span>
                    <GitFork
                      className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
