"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Download,
  GripVertical,
  Link2,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "~/lib/utils";
import { recipeDetailPath } from "~/lib/recipe-path";
import { type RecipeInput } from "~/server/recipes/validation";
import { type ImportedRecipe } from "~/server/recipes/import";
import {
  createRecipeAction,
  importRecipeFromUrlAction,
  updateRecipeAction,
} from "~/server/recipes/actions";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Label } from "~/components/ui/label";
import { ImageUploadField } from "~/components/ui/image-upload";

type IngRow = {
  key: string;
  section: string;
  quantity: string;
  unit: string;
  item: string;
  note: string;
  optional: boolean;
};
type StepRow = {
  key: string;
  instruction: string;
  imageUrl: string;
  timerMinutes: string;
  techniques: string;
};

export type RecipeEditorValue = {
  title: string;
  description: string;
  coverImageUrl: string;
  servings: string;
  servingsNoun: string;
  prepMinutes: string;
  cookMinutes: string;
  difficulty: "" | "easy" | "medium" | "hard";
  cuisine: string;
  sourceName: string;
  sourceUrl: string;
  notes: string;
  visibility: "private" | "group" | "unlisted" | "public";
  status: "draft" | "published";
  groupId: string;
  tags: string;
  ingredients: Omit<IngRow, "key">[];
  steps: Omit<StepRow, "key">[];
};

let idCounter = 0;
const nextKey = () => `row-${idCounter++}`;

const EMPTY_ING: Omit<IngRow, "key"> = {
  section: "",
  quantity: "",
  unit: "",
  item: "",
  note: "",
  optional: false,
};
const EMPTY_STEP: Omit<StepRow, "key"> = {
  instruction: "",
  imageUrl: "",
  timerMinutes: "",
  techniques: "",
};

function numOrUndef(s: string): number | undefined {
  const t = s.trim();
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm";

export function RecipeEditor({
  mode,
  recipeId,
  initial,
  groups = [],
}: {
  mode: "create" | "edit";
  recipeId?: string;
  initial?: RecipeEditorValue;
  groups?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [importUrl, setImportUrl] = React.useState("");
  const [importing, setImporting] = React.useState(false);

  const [form, setForm] = React.useState(() => ({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    coverImageUrl: initial?.coverImageUrl ?? "",
    servings: initial?.servings ?? "4",
    servingsNoun: initial?.servingsNoun ?? "servings",
    prepMinutes: initial?.prepMinutes ?? "",
    cookMinutes: initial?.cookMinutes ?? "",
    difficulty: initial?.difficulty ?? "",
    cuisine: initial?.cuisine ?? "",
    sourceName: initial?.sourceName ?? "",
    sourceUrl: initial?.sourceUrl ?? "",
    notes: initial?.notes ?? "",
    visibility: initial?.visibility ?? "private",
    status: initial?.status ?? "published",
    groupId: initial?.groupId ?? "",
    tags: initial?.tags ?? "",
  }));

  const [ingredients, setIngredients] = React.useState<IngRow[]>(() =>
    (initial?.ingredients?.length
      ? initial.ingredients
      : [EMPTY_ING, EMPTY_ING]
    ).map((r) => ({ ...r, key: nextKey() })),
  );
  const [steps, setSteps] = React.useState<StepRow[]>(() =>
    (initial?.steps?.length ? initial.steps : [EMPTY_STEP]).map((r) => ({
      ...r,
      key: nextKey(),
    })),
  );

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function applyImported(v: ImportedRecipe) {
    setForm((f) => ({
      ...f,
      title: v.title || f.title,
      description: v.description || f.description,
      coverImageUrl: v.coverImageUrl || f.coverImageUrl,
      servings: v.servings || f.servings,
      servingsNoun: v.servingsNoun || f.servingsNoun,
      prepMinutes: v.prepMinutes || f.prepMinutes,
      cookMinutes: v.cookMinutes || f.cookMinutes,
      cuisine: v.cuisine || f.cuisine,
      sourceName: v.sourceName || f.sourceName,
      sourceUrl: v.sourceUrl || f.sourceUrl,
      tags: v.tags || f.tags,
    }));
    if (v.ingredients.length)
      setIngredients(v.ingredients.map((r) => ({ ...r, key: nextKey() })));
    if (v.steps.length)
      setSteps(v.steps.map((r) => ({ ...r, key: nextKey() })));
  }

  async function handleImport() {
    const url = importUrl.trim();
    if (!url) return;
    setImporting(true);
    try {
      const res = await importRecipeFromUrlAction(url);
      if (res.ok) {
        applyImported(res.recipe);
        toast.success(
          res.recipe.title
            ? `Imported “${res.recipe.title}”. Review the details, then save.`
            : "Imported the recipe. Review the details, then save.",
        );
        setImportUrl("");
      } else {
        toast.error(res.error);
      }
    } catch {
      toast.error("Something went wrong importing that link.");
    } finally {
      setImporting(false);
    }
  }

  function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
    const j = i + dir;
    if (j < 0 || j >= list.length) return list;
    const copy = [...list];
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    return copy;
  }

  function buildPayload(): RecipeInput {
    return {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      coverImageUrl: form.coverImageUrl.trim() || undefined,
      servings: numOrUndef(form.servings),
      servingsNoun: form.servingsNoun.trim() || undefined,
      prepMinutes: numOrUndef(form.prepMinutes),
      cookMinutes: numOrUndef(form.cookMinutes),
      totalMinutes: undefined,
      difficulty: form.difficulty || undefined,
      cuisine: form.cuisine.trim() || undefined,
      sourceName: form.sourceName.trim() || undefined,
      sourceUrl: form.sourceUrl.trim() || undefined,
      notes: form.notes.trim() || undefined,
      visibility: form.visibility,
      status: form.status,
      groupId:
        form.visibility === "group" && form.groupId ? form.groupId : undefined,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      ingredients: ingredients
        .filter((r) => r.item.trim() !== "")
        .map((r) => ({
          section: r.section.trim() || undefined,
          quantity: numOrUndef(r.quantity),
          quantityMax: undefined,
          unit: r.unit.trim() || undefined,
          item: r.item.trim(),
          note: r.note.trim() || undefined,
          optional: r.optional,
        })),
      steps: steps
        .filter((r) => r.instruction.trim() !== "")
        .map((r) => ({
          section: undefined,
          instruction: r.instruction.trim(),
          imageUrl: r.imageUrl.trim() || undefined,
          videoUrl: undefined,
          timerSeconds: r.timerMinutes.trim()
            ? Math.round(Number(r.timerMinutes) * 60)
            : undefined,
          techniques: r.techniques
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        })),
    };
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    const payload = buildPayload();
    if (!payload.title) {
      setErrors({ title: ["Give your recipe a title"] });
      toast.error("Your recipe needs a title.");
      return;
    }
    if (payload.visibility === "group" && !payload.groupId) {
      setErrors({ groupId: ["Choose a group for a group-visibility recipe"] });
      toast.error("Pick a group, or change the recipe's visibility.");
      return;
    }
    startTransition(async () => {
      const res =
        mode === "edit" && recipeId
          ? await updateRecipeAction(recipeId, payload)
          : await createRecipeAction(payload);
      if (res.ok) {
        toast.success(mode === "edit" ? "Recipe updated" : "Recipe created");
        router.push(recipeDetailPath(res));
        router.refresh();
      } else {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="container flex flex-col gap-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {mode === "edit" ? "Edit recipe" : "New recipe"}
        </h1>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />}
            {mode === "edit" ? "Save changes" : "Save recipe"}
          </Button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Main column */}
        <div className="flex flex-col gap-8">
          {mode === "create" ? (
            <section className="rounded-xl border border-border bg-muted/40 p-4">
              <div className="flex items-center gap-2">
                <Link2 className="size-4 text-primary" />
                <h2 className="font-display text-base font-semibold">
                  Import from a link
                </h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
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
                  aria-label="Recipe URL to import"
                />
                <Button
                  type="button"
                  onClick={() => void handleImport()}
                  disabled={importing || !importUrl.trim()}
                  className="shrink-0"
                >
                  {importing ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Download />
                  )}
                  {importing ? "Importing…" : "Import"}
                </Button>
              </div>
            </section>
          ) : null}

          <section className="flex flex-col gap-4">
            <Field label="Title" error={errors.title} required>
              <Input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Grandma's Sunday Marinara"
                autoFocus
              />
            </Field>
            <Field label="Description" hint="A sentence about the dish.">
              <Textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="The slow-simmered sauce that started every Sunday."
                rows={2}
              />
            </Field>
          </section>

          {/* Ingredients */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold">Ingredients</h2>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setIngredients((l) => [...l, { ...EMPTY_ING, key: nextKey() }])
                }
              >
                <Plus /> Add
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              {ingredients.map((row, i) => (
                <div
                  key={row.key}
                  className="flex items-start gap-2 rounded-lg border border-border bg-card p-2"
                >
                  <div className="grid flex-1 gap-2 sm:grid-cols-[4rem_5rem_1fr]">
                    <Input
                      aria-label="Quantity"
                      value={row.quantity}
                      onChange={(e) =>
                        setIngredients((l) =>
                          l.map((r) =>
                            r.key === row.key
                              ? { ...r, quantity: e.target.value }
                              : r,
                          ),
                        )
                      }
                      placeholder="2"
                      inputMode="decimal"
                    />
                    <Input
                      aria-label="Unit"
                      value={row.unit}
                      onChange={(e) =>
                        setIngredients((l) =>
                          l.map((r) =>
                            r.key === row.key
                              ? { ...r, unit: e.target.value }
                              : r,
                          ),
                        )
                      }
                      placeholder="cup"
                    />
                    <Input
                      aria-label="Ingredient"
                      value={row.item}
                      onChange={(e) =>
                        setIngredients((l) =>
                          l.map((r) =>
                            r.key === row.key
                              ? { ...r, item: e.target.value }
                              : r,
                          ),
                        )
                      }
                      placeholder="all-purpose flour"
                    />
                  </div>
                  <RowControls
                    onUp={() => setIngredients((l) => move(l, i, -1))}
                    onDown={() => setIngredients((l) => move(l, i, 1))}
                    onRemove={() =>
                      setIngredients((l) =>
                        l.length > 1 ? l.filter((r) => r.key !== row.key) : l,
                      )
                    }
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Steps */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold">Steps</h2>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setSteps((l) => [...l, { ...EMPTY_STEP, key: nextKey() }])
                }
              >
                <Plus /> Add
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              {steps.map((row, i) => (
                <div
                  key={row.key}
                  className="flex items-start gap-2 rounded-lg border border-border bg-card p-2"
                >
                  <span className="mt-2 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary">
                    {i + 1}
                  </span>
                  <div className="flex flex-1 flex-col gap-2">
                    <Textarea
                      aria-label={`Step ${i + 1}`}
                      value={row.instruction}
                      onChange={(e) =>
                        setSteps((l) =>
                          l.map((r) =>
                            r.key === row.key
                              ? { ...r, instruction: e.target.value }
                              : r,
                          ),
                        )
                      }
                      placeholder="Whisk the dry ingredients together…"
                      rows={2}
                    />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input
                        aria-label="Timer in minutes"
                        value={row.timerMinutes}
                        onChange={(e) =>
                          setSteps((l) =>
                            l.map((r) =>
                              r.key === row.key
                                ? { ...r, timerMinutes: e.target.value }
                                : r,
                            ),
                          )
                        }
                        placeholder="Timer (min)"
                        inputMode="decimal"
                      />
                      <Input
                        aria-label="Techniques"
                        value={row.techniques}
                        onChange={(e) =>
                          setSteps((l) =>
                            l.map((r) =>
                              r.key === row.key
                                ? { ...r, techniques: e.target.value }
                                : r,
                            ),
                          )
                        }
                        placeholder="Techniques (comma sep.)"
                      />
                    </div>
                    <ImageUploadField
                      size="compact"
                      label={`Step ${i + 1} photo`}
                      value={row.imageUrl}
                      onChange={(url) =>
                        setSteps((l) =>
                          l.map((r) =>
                            r.key === row.key ? { ...r, imageUrl: url } : r,
                          ),
                        )
                      }
                    />
                  </div>
                  <RowControls
                    onUp={() => setSteps((l) => move(l, i, -1))}
                    onDown={() => setSteps((l) => move(l, i, 1))}
                    onRemove={() =>
                      setSteps((l) =>
                        l.length > 1 ? l.filter((r) => r.key !== row.key) : l,
                      )
                    }
                  />
                </div>
              ))}
            </div>
          </section>

          <Field label="Notes" hint="Tips, substitutions, the story behind it.">
            <Textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={3}
            />
          </Field>
        </div>

        {/* Sidebar */}
        <aside className="flex h-fit flex-col gap-5 rounded-xl border border-border bg-surface/50 p-5 lg:sticky lg:top-20">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Servings">
              <Input
                value={form.servings}
                onChange={(e) => set("servings", e.target.value)}
                inputMode="numeric"
              />
            </Field>
            <Field label="Unit">
              <Input
                value={form.servingsNoun}
                onChange={(e) => set("servingsNoun", e.target.value)}
              />
            </Field>
            <Field label="Prep (min)">
              <Input
                value={form.prepMinutes}
                onChange={(e) => set("prepMinutes", e.target.value)}
                inputMode="numeric"
              />
            </Field>
            <Field label="Cook (min)">
              <Input
                value={form.cookMinutes}
                onChange={(e) => set("cookMinutes", e.target.value)}
                inputMode="numeric"
              />
            </Field>
          </div>

          <Field label="Difficulty">
            <select
              className={selectClass}
              value={form.difficulty}
              onChange={(e) =>
                set("difficulty", e.target.value as typeof form.difficulty)
              }
            >
              <option value="">—</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </Field>

          <Field label="Cuisine">
            <Input
              value={form.cuisine}
              onChange={(e) => set("cuisine", e.target.value)}
              placeholder="Italian"
            />
          </Field>

          <Field label="Tags" hint="Comma separated.">
            <Input
              value={form.tags}
              onChange={(e) => set("tags", e.target.value)}
              placeholder="dinner, weeknight"
            />
          </Field>

          <ImageUploadField
            label="Cover photo"
            hint="Upload a photo or paste an image URL."
            value={form.coverImageUrl}
            onChange={(url) => set("coverImageUrl", url)}
          />

          <div className="h-px bg-border" />

          <Field label="Who can see this?">
            <select
              className={selectClass}
              value={form.visibility}
              onChange={(e) =>
                set("visibility", e.target.value as typeof form.visibility)
              }
            >
              <option value="private">Only me</option>
              <option value="group" disabled={groups.length === 0}>
                A family/group
              </option>
              <option value="unlisted">Anyone with the link</option>
              <option value="public">Everyone (public)</option>
            </select>
          </Field>

          {form.visibility === "group" && groups.length > 0 && (
            <Field label="Group">
              <select
                className={selectClass}
                value={form.groupId}
                onChange={(e) => set("groupId", e.target.value)}
              >
                <option value="">Choose a group…</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Status">
            <select
              className={selectClass}
              value={form.status}
              onChange={(e) =>
                set("status", e.target.value as typeof form.status)
              }
            >
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
          </Field>
        </aside>
      </div>
    </form>
  );
}

function RowControls({
  onUp,
  onDown,
  onRemove,
}: {
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center">
      <GripVertical className="hidden size-4 text-muted-foreground sm:block" />
      <Button type="button" size="icon" variant="ghost" aria-label="Move up" onClick={onUp}>
        <ChevronUp />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="Move down"
        onClick={onDown}
      >
        <ChevronDown />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="Remove"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={onRemove}
      >
        <Trash2 />
      </Button>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string[];
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="flex items-center gap-1">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {hint && !error?.length && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
      {error?.length ? (
        <p className={cn("text-xs text-destructive")}>{error[0]}</p>
      ) : null}
    </div>
  );
}
