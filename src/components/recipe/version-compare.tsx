"use client";

import * as React from "react";
import { ArrowRight, GitCompare, Loader2, Minus, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

import { cn } from "~/lib/utils";
import { friendlyError } from "~/lib/error-copy";
import {
  compareRecipeVersionsAction,
  type CompareSelection,
} from "~/server/recipes/actions";
import type { LineDiff, RecipeDiff, SectionDiff } from "~/lib/recipe-diff";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

type VersionOption = { versionNumber: number; label: string };

export type VersionCompareProps = {
  recipeId: string;
  // Newest-first, matching the version history list.
  versions: VersionOption[];
};

const CURRENT = "current" as const;

function toSelection(value: string): CompareSelection {
  return value === CURRENT ? CURRENT : Number(value);
}

/**
 * Timeline "Compare" affordance (#358): pick two points in a recipe's history
 * (a saved version or the live recipe) and see an inline diff of scalar fields,
 * ingredient lines, and steps. Read-only — Restore lives in the version list.
 */
export function VersionCompare({ recipeId, versions }: VersionCompareProps) {
  // Need at least one saved version to have anything to compare against.
  const options = React.useMemo(
    () => [
      { value: CURRENT, label: "Current recipe" },
      ...versions.map((v) => ({
        value: String(v.versionNumber),
        label: `v${v.versionNumber} · ${v.label}`,
      })),
    ],
    [versions],
  );

  // Default: the previous saved version → the current recipe.
  const defaultFrom = versions[0] ? String(versions[0].versionNumber) : CURRENT;
  const [from, setFrom] = React.useState<string>(defaultFrom);
  const [to, setTo] = React.useState<string>(CURRENT);
  const [diff, setDiff] = React.useState<RecipeDiff | null>(null);
  const [pending, startTransition] = React.useTransition();

  if (versions.length === 0) return null;

  function onCompare() {
    startTransition(async () => {
      const result = await compareRecipeVersionsAction(
        recipeId,
        toSelection(from),
        toSelection(to),
      );
      if (result.ok) {
        setDiff(result.diff);
        return;
      }
      toast.error(friendlyError(result.error));
    });
  }

  return (
    <section
      className="rounded-xl border border-border bg-card p-5 shadow-token"
      aria-label="Compare recipe versions"
    >
      <div className="mb-4 flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          <GitCompare className="size-4" aria-hidden="true" />
        </div>
        <div>
          <h3 className="font-display text-lg font-semibold">Compare versions</h3>
          <p className="text-sm text-muted-foreground">
            See exactly what changed between two points in this recipe&apos;s
            history.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-muted-foreground">From</span>
          <Select value={from} onValueChange={setFrom}>
            <SelectTrigger className="w-52" aria-label="Compare from version">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={`from-${o.value}`} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <ArrowRight
          className="mb-2.5 size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-muted-foreground">To</span>
          <Select value={to} onValueChange={setTo}>
            <SelectTrigger className="w-52" aria-label="Compare to version">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={`to-${o.value}`} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <Button type="button" onClick={onCompare} disabled={pending}>
          {pending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <GitCompare aria-hidden="true" />
          )}
          Compare
        </Button>
      </div>

      {diff && <DiffResult diff={diff} />}
    </section>
  );
}

function summaryText(diff: RecipeDiff): string {
  const { changed, added, removed } = diff.summary;
  const parts: string[] = [];
  if (changed > 0) parts.push(`${changed} changed`);
  if (added > 0) parts.push(`${added} added`);
  if (removed > 0) parts.push(`${removed} removed`);
  return parts.length > 0 ? parts.join(" · ") : "No differences";
}

function DiffResult({ diff }: { diff: RecipeDiff }) {
  return (
    <div className="mt-5 flex flex-col gap-5" aria-live="polite">
      <p className="text-sm font-medium">{summaryText(diff)}</p>

      {diff.identical ? (
        <p className="rounded-lg border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
          These two versions are identical.
        </p>
      ) : (
        <>
          {diff.fields.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-sm font-semibold">Details</h4>
              <ul className="flex flex-col gap-2">
                {diff.fields.map((field) => (
                  <li
                    key={field.key}
                    className="rounded-lg border border-border/70 bg-background p-3 text-sm"
                  >
                    <span className="font-medium">{field.label}</span>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
                      <span className="line-through decoration-destructive/60">
                        {field.before ?? "—"}
                      </span>
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                      <span className="text-foreground">{field.after ?? "—"}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DiffSection title="Ingredients" section={diff.ingredients} />
          <DiffSection title="Steps" section={diff.steps} />
        </>
      )}
    </div>
  );
}

function DiffSection({
  title,
  section,
}: {
  title: string;
  section: SectionDiff;
}) {
  const [showUnchanged, setShowUnchanged] = React.useState(false);
  const changedLines = section.lines.filter((l) => l.kind !== "unchanged");
  const unchangedCount = section.lines.length - changedLines.length;

  if (section.lines.length === 0) return null;

  const visible = showUnchanged ? section.lines : changedLines;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{title}</h4>
        {unchangedCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowUnchanged((v) => !v)}
            aria-expanded={showUnchanged}
          >
            {showUnchanged
              ? "Hide unchanged"
              : `Show ${unchangedCount} unchanged`}
          </Button>
        )}
      </div>
      {changedLines.length === 0 && !showUnchanged ? (
        <p className="text-sm text-muted-foreground">No changes.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {visible.map((line, i) => (
            <DiffLineRow key={`${title}-${i}`} line={line} />
          ))}
        </ul>
      )}
    </div>
  );
}

const KIND_META: Record<
  LineDiff["kind"],
  { icon: typeof Plus; className: string; label: string }
> = {
  added: {
    icon: Plus,
    className: "border-primary/40 bg-primary/5 text-foreground",
    label: "Added",
  },
  removed: {
    icon: Minus,
    className: "border-destructive/40 bg-destructive/5 text-muted-foreground",
    label: "Removed",
  },
  changed: {
    icon: Pencil,
    className: "border-secondary/40 bg-secondary/10 text-foreground",
    label: "Changed",
  },
  unchanged: {
    icon: Minus,
    className: "border-border/70 bg-background text-muted-foreground",
    label: "Unchanged",
  },
};

function DiffLineRow({ line }: { line: LineDiff }) {
  const meta = KIND_META[line.kind];
  const Icon = meta.icon;
  return (
    <li
      className={cn(
        "flex items-start gap-2 rounded-lg border p-2.5 text-sm",
        meta.className,
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span className="sr-only">{meta.label}:</span>
      <span className="min-w-0">
        {line.kind === "changed" ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="line-through decoration-destructive/60">
              {line.before}
            </span>
            <ArrowRight className="size-3" aria-hidden="true" />
            <span className="text-foreground">{line.after}</span>
          </span>
        ) : (
          (line.after ?? line.before)
        )}
      </span>
    </li>
  );
}
