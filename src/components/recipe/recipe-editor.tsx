"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  GripVertical,
  History,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "~/lib/error-copy";
import { pickKidCopy } from "~/config/kid-copy";
import { useThemeBehavior } from "~/components/theme/theme-provider";

import { cn } from "~/lib/utils";
import { recipeDetailPath } from "~/lib/recipe-path";
import { useAutosaveDraft } from "~/lib/use-autosave-draft";
import { track } from "~/lib/analytics";
import { SUGGESTED_TAGS } from "~/lib/tag-taxonomy";
import { type RecipeInput } from "~/server/recipes/validation";
import {
  DIETARY_TAGS,
  DIETARY_TAG_LABELS,
  type DietaryTag,
} from "~/lib/substitutions";
import { type ImportedRecipe } from "~/server/recipes/import";
import {
  createRecipeAction,
  updateRecipeAction,
} from "~/server/recipes/actions";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Label } from "~/components/ui/label";
import { ImageUploadField } from "~/components/ui/image-upload";
import { appendDictation } from "~/lib/append-dictation";

/**
 * The upgrade prompt is only needed when a create hits the plan's recipe cap
 * (#318), so it's code-split out of the editor's first-load JS and fetched lazily
 * the first time it's shown.
 */
const UpgradeDialog = dynamic(() =>
  import("~/components/billing/upgrade-dialog").then((m) => m.UpgradeDialog),
);

const ImportRecipePanel = dynamic(
  () => import("~/components/recipe/import-recipe-panel").then((m) => m.ImportRecipePanel),
  { ssr: false },
);

// Voice dictation (issue #373) is a progressive enhancement, so it is
// code-split out of the editor's first-load JS and loaded on the client only.
const DictationButton = dynamic(
  () =>
    import("~/components/recipe/dictation-button").then(
      (m) => m.DictationButton,
    ),
  { ssr: false },
);

type IngRow = {
  key: string;
  section: string;
  quantity: string;
  unit: string;
  item: string;
  note: string;
  prep: string;
  stepPosition: string;
  optional: boolean;
};
type StepRow = {
  key: string;
  instruction: string;
  imageUrl: string;
  timerMinutes: string;
  targetTempC: string;
  doneness: string;
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
  restMinutes?: string;
  makeAheadNote?: string;
  equipment?: string;
  calories: string;
  proteinGrams: string;
  carbsGrams: string;
  fatGrams: string;
  saturatedFatGrams: string;
  sodiumMg: string;
  sugarGrams: string;
  fiberGrams: string;
  difficulty: "" | "easy" | "medium" | "hard";
  cuisine: string;
  sourceName: string;
  sourceUrl: string;
  notes: string;
  story?: string;
  handedDownFrom?: string;
  originYear?: string;
  originPlace?: string;
  visibility: "private" | "group" | "unlisted" | "public";
  status: "draft" | "published";
  groupId: string;
  tags: string;
  dietaryFlags: DietaryTag[];
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
  prep: "",
  stepPosition: "",
  optional: false,
};
const EMPTY_STEP: Omit<StepRow, "key"> = {
  instruction: "",
  imageUrl: "",
  timerMinutes: "",
  targetTempC: "",
  doneness: "",
  techniques: "",
};

/** Stable empty field-error map — the initial/cleared useActionState value. */
const NO_ERRORS: Record<string, string[]> = {};

/**
 * The per-serving nutrition keys shared by {@link RecipeEditorValue}, the editor
 * form state, and the payload builder.
 */
type NutritionKey =
  | "calories"
  | "proteinGrams"
  | "carbsGrams"
  | "fatGrams"
  | "saturatedFatGrams"
  | "sodiumMg"
  | "sugarGrams"
  | "fiberGrams";

/**
 * Per-serving nutrition inputs (issue #414). Declared once so the editor state,
 * payload builder, and UI stay in sync. `unit` is shown as a suffix hint so a
 * cook knows whether a field wants grams or milligrams.
 */
const NUTRITION_FIELDS = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "proteinGrams", label: "Protein", unit: "g" },
  { key: "carbsGrams", label: "Carbs", unit: "g" },
  { key: "fatGrams", label: "Fat", unit: "g" },
  { key: "saturatedFatGrams", label: "Saturated fat", unit: "g" },
  { key: "sodiumMg", label: "Sodium", unit: "mg" },
  { key: "sugarGrams", label: "Sugars", unit: "g" },
  { key: "fiberGrams", label: "Fiber", unit: "g" },
] as const satisfies readonly {
  key: NutritionKey;
  label: string;
  unit: string;
}[];

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
  initialCoverImageUrl,
  initialTitle,
  groups = [],
}: {
  mode: "create" | "edit";
  recipeId?: string;
  initial?: RecipeEditorValue;
  /** Pre-filled cover (e.g. a photo shared into the PWA share target). */
  initialCoverImageUrl?: string;
  /** Pre-filled title (e.g. seeded from a searched-but-missing recipe, #103). */
  initialTitle?: string;
  groups?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const t = useTranslations("recipeEditor");
  const { kidSafe } = useThemeBehavior();
  const [upgrade, setUpgrade] = React.useState<string | null>(null);
  const errorSummaryRef = React.useRef<HTMLDivElement>(null);

  // Editor-open is the top of the creation/edit funnel (#310).
  React.useEffect(() => {
    track("editor_opened", { mode });
  }, [mode]);

  const [form, setForm] = React.useState(() => ({
    title: initial?.title ?? initialTitle ?? "",
    description: initial?.description ?? "",
    coverImageUrl: initial?.coverImageUrl ?? initialCoverImageUrl ?? "",
    servings: initial?.servings ?? "4",
    servingsNoun: initial?.servingsNoun ?? "servings",
    prepMinutes: initial?.prepMinutes ?? "",
    cookMinutes: initial?.cookMinutes ?? "",
    restMinutes: initial?.restMinutes ?? "",
    makeAheadNote: initial?.makeAheadNote ?? "",
    equipment: initial?.equipment ?? "",
    calories: initial?.calories ?? "",
    proteinGrams: initial?.proteinGrams ?? "",
    carbsGrams: initial?.carbsGrams ?? "",
    fatGrams: initial?.fatGrams ?? "",
    saturatedFatGrams: initial?.saturatedFatGrams ?? "",
    sodiumMg: initial?.sodiumMg ?? "",
    sugarGrams: initial?.sugarGrams ?? "",
    fiberGrams: initial?.fiberGrams ?? "",
    difficulty: initial?.difficulty ?? "",
    cuisine: initial?.cuisine ?? "",
    sourceName: initial?.sourceName ?? "",
    sourceUrl: initial?.sourceUrl ?? "",
    notes: initial?.notes ?? "",
    story: initial?.story ?? "",
    handedDownFrom: initial?.handedDownFrom ?? "",
    originYear: initial?.originYear ?? "",
    originPlace: initial?.originPlace ?? "",
    visibility: initial?.visibility ?? "private",
    status: initial?.status ?? "published",
    groupId: initial?.groupId ?? "",
    tags: initial?.tags ?? "",
    dietaryFlags: initial?.dietaryFlags ?? [],
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

  // Auto-save & draft recovery (#421): mirror the in-progress editor value to
  // localStorage (debounced) so a locked phone or a stray "back" tap never
  // loses a half-typed recipe. Drafts are namespaced so new vs. edit can't mix.
  const draftKey = mode === "edit" && recipeId ? recipeId : "new";
  const draftSnapshot: RecipeEditorValue = React.useMemo(
    () => ({
      ...form,
      ingredients: ingredients.map(({ key: _key, ...rest }) => rest),
      steps: steps.map(({ key: _key, ...rest }) => rest),
    }),
    [form, ingredients, steps],
  );
  const draftJson = React.useMemo(
    () => JSON.stringify(draftSnapshot),
    [draftSnapshot],
  );
  const [initialDraftJson] = React.useState(() => draftJson);
  const draftDirty = draftJson !== initialDraftJson;
  const draft = useAutosaveDraft<RecipeEditorValue>({
    key: draftKey,
    snapshot: draftSnapshot,
    dirty: draftDirty,
  });

  function restoreDraft(value: RecipeEditorValue) {
    const {
      ingredients: draftIngredients,
      steps: draftSteps,
      ...scalars
    } = value;
    setForm((f) => ({ ...f, ...scalars }));
    setIngredients(
      (draftIngredients ?? []).map((r) => ({
        ...EMPTY_ING,
        ...r,
        key: nextKey(),
      })),
    );
    setSteps(
      (draftSteps ?? []).map((r) => ({ ...EMPTY_STEP, ...r, key: nextKey() })),
    );
    draft.acceptDraft();
    toast.success("Restored your unfinished recipe.");
  }

  // Voice dictation append helpers (#373): always append, never overwrite, and
  // update functionally so rapid transcript chunks can't clobber each other.
  function appendToField(key: "description" | "notes" | "story", text: string) {
    setForm((f) => ({ ...f, [key]: appendDictation(f[key], text) }));
  }
  function appendIngredientItem(rowKey: string, text: string) {
    setIngredients((l) =>
      l.map((r) =>
        r.key === rowKey ? { ...r, item: appendDictation(r.item, text) } : r,
      ),
    );
  }
  function appendStepInstruction(rowKey: string, text: string) {
    setSteps((l) =>
      l.map((r) =>
        r.key === rowKey
          ? { ...r, instruction: appendDictation(r.instruction, text) }
          : r,
      ),
    );
  }

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Parsed view of the comma-separated tags field, used by the quick-add chips.
  const tagList = form.tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  function toggleTag(name: string) {
    const has = tagList.some((t) => t.toLowerCase() === name.toLowerCase());
    const next = has
      ? tagList.filter((t) => t.toLowerCase() !== name.toLowerCase())
      : [...tagList, name];
    set("tags", next.join(", "));
  }

  function toggleDietaryFlag(tag: DietaryTag) {
    setForm((f) => ({
      ...f,
      dietaryFlags: f.dietaryFlags.includes(tag)
        ? f.dietaryFlags.filter((t) => t !== tag)
        : [...f.dietaryFlags, tag],
    }));
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
      setIngredients(
        v.ingredients.map((r) => ({ ...EMPTY_ING, ...r, key: nextKey() })),
      );
    if (v.steps.length)
      setSteps(v.steps.map((r) => ({ ...EMPTY_STEP, ...r, key: nextKey() })));
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
      restMinutes: numOrUndef(form.restMinutes),
      makeAheadNote: form.makeAheadNote.trim() || undefined,
      equipment: form.equipment
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      totalMinutes: undefined,
      calories: numOrUndef(form.calories),
      proteinGrams: numOrUndef(form.proteinGrams),
      carbsGrams: numOrUndef(form.carbsGrams),
      fatGrams: numOrUndef(form.fatGrams),
      saturatedFatGrams: numOrUndef(form.saturatedFatGrams),
      sodiumMg: numOrUndef(form.sodiumMg),
      sugarGrams: numOrUndef(form.sugarGrams),
      fiberGrams: numOrUndef(form.fiberGrams),
      difficulty: form.difficulty || undefined,
      cuisine: form.cuisine.trim() || undefined,
      sourceName: form.sourceName.trim() || undefined,
      sourceUrl: form.sourceUrl.trim() || undefined,
      notes: form.notes.trim() || undefined,
      story: form.story.trim() || undefined,
      handedDownFrom: form.handedDownFrom.trim() || undefined,
      originYear: form.originYear.trim() || undefined,
      originPlace: form.originPlace.trim() || undefined,
      visibility: form.visibility,
      status: form.status,
      groupId:
        form.visibility === "group" && form.groupId ? form.groupId : undefined,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      dietaryFlags: form.dietaryFlags,
      ingredients: ingredients
        .filter((r) => r.item.trim() !== "")
        .map((r) => ({
          section: r.section.trim() || undefined,
          quantity: numOrUndef(r.quantity),
          quantityMax: undefined,
          unit: r.unit.trim() || undefined,
          item: r.item.trim(),
          note: r.note.trim() || undefined,
          prep: r.prep.trim() || undefined,
          stepPosition: numOrUndef(r.stepPosition),
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
          targetTempC: numOrUndef(r.targetTempC),
          doneness: r.doneness.trim() || undefined,
          techniques: r.techniques
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        })),
    };
  }

  // Keep the payload builder fresh for the action closure without recreating
  // the action each render — buildPayload closes over the latest form /
  // ingredient / step state on every render.
  const buildPayloadRef = React.useRef(buildPayload);
  buildPayloadRef.current = buildPayload;

  // #197: submit through useActionState + <form action>. Pending comes from the
  // hook and the server's Zod field errors flow back as the returned state, so
  // there's no manual useTransition or setErrors bookkeeping to keep in sync.
  const [errors, formAction, pending] = React.useActionState(
    async (
      _prev: Record<string, string[]>,
      _formData: FormData,
    ): Promise<Record<string, string[]>> => {
      const payload = buildPayloadRef.current();
      if (!payload.title) {
        toast.error(pickKidCopy(kidSafe, "validation.title", "Your recipe needs a title."));
        return { title: ["Give your recipe a title"] };
      }
      if (payload.visibility === "group" && !payload.groupId) {
        toast.error("Pick a group, or change the recipe's visibility.");
        return { groupId: ["Choose a group for this group recipe"] };
      }
      const res =
        mode === "edit" && recipeId
          ? await updateRecipeAction(recipeId, payload)
          : await createRecipeAction(payload);
      if (res.ok) {
        draft.clear();
        toast.success(mode === "edit" ? "Recipe updated" : "Recipe created");
        router.push(recipeDetailPath(res));
        router.refresh();
        return NO_ERRORS;
      }
      track("editor_save_failed", {
        mode,
        fieldCount: Object.keys(res.fieldErrors ?? {}).length,
      });
      // Plan-limit failures (#318) get a dedicated upgrade prompt instead of a
      // bare error toast, so the path forward is obvious and non-punitive.
      if (res.upgrade) {
        setUpgrade(res.error);
      } else {
        toast.error(friendlyError(res.error));
      }
      return res.fieldErrors ?? NO_ERRORS;
    },
    NO_ERRORS,
  );
  const errorKeys = Object.keys(errors);

  // Move focus to the summary whenever a submit attempt produces errors so
  // screen-reader and keyboard users land on the list of what needs fixing.
  React.useEffect(() => {
    if (Object.keys(errors).length > 0) {
      errorSummaryRef.current?.focus();
    }
  }, [errors]);

  return (
    <form action={formAction} className="container flex flex-col gap-8 py-8">
      {upgrade !== null ? (
        <UpgradeDialog
          feature="advancedCollaboration"
          open
          onOpenChange={(next) => {
            if (!next) setUpgrade(null);
          }}
          title="You've reached your plan's limit"
          description={upgrade}
        />
      ) : null}
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

      {draft.availableDraft ? (
        <div
          role="region"
          aria-label="Unfinished recipe"
          className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <History
              className="mt-0.5 size-5 shrink-0 text-primary"
              aria-hidden="true"
            />
            <div>
              <p className="font-medium">You have an unfinished recipe</p>
              <p className="text-sm text-muted-foreground">
                Pick up where you left off, or start fresh.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => draft.discardDraft()}
            >
              Discard
            </Button>
            <Button
              type="button"
              onClick={() => {
                const pending = draft.availableDraft;
                if (pending) restoreDraft(pending);
              }}
            >
              Restore
            </Button>
          </div>
        </div>
      ) : null}

      {errorKeys.length > 0 && (
        <div
          ref={errorSummaryRef}
          tabIndex={-1}
          role="alert"
          aria-labelledby="recipe-error-summary-heading"
          className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm outline-none"
        >
          <h2
            id="recipe-error-summary-heading"
            className="flex items-center gap-2 font-medium text-destructive"
          >
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            {errorKeys.length === 1
              ? "Please fix this field before saving:"
              : `Please fix these ${errorKeys.length} fields before saving:`}
          </h2>
          <ul className="mt-2 flex list-disc flex-col gap-1 ps-8">
            {errorKeys.map((key) => {
              const label = FIELD_LABELS[key] ?? prettifyFieldKey(key);
              const message = errors[key]?.[0];
              const targetId = `recipe-field-${key}`;
              return (
                <li key={key}>
                  {ANCHORABLE_FIELDS.has(key) ? (
                    <a
                      href={`#${targetId}`}
                      onClick={(e) => {
                        const el = document.getElementById(targetId);
                        if (el) {
                          e.preventDefault();
                          el.scrollIntoView({
                            block: "center",
                            behavior: "smooth",
                          });
                          el.focus();
                        }
                      }}
                      className="font-medium text-destructive underline underline-offset-2 hover:no-underline"
                    >
                      {label}
                    </a>
                  ) : (
                    <span className="font-medium text-destructive">
                      {label}
                    </span>
                  )}
                  {message ? (
                    <span className="text-muted-foreground"> — {message}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Main column */}
        <div className="flex flex-col gap-8">
          {mode === "create" ? (
            <ImportRecipePanel
              onImported={applyImported}
              urlLabel={t("importUrl")}
            />
          ) : null}

          <section className="flex flex-col gap-4">
            <Field label="Title" name="title" error={errors.title} required>
              <Input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Grandma's Sunday Marinara"
                autoFocus
              />
            </Field>
            <Field
              label="Description"
              name="description"
              hint="A sentence about the dish."
              error={errors.description}
            >
              <Textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="The slow-simmered sauce that started every Sunday."
                rows={2}
              />
            </Field>
            <div className="-mt-1 flex justify-end">
              <DictationButton
                fieldLabel="description"
                onAppend={(text) => appendToField("description", text)}
              />
            </div>
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
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="grid gap-2 sm:grid-cols-[4rem_5rem_1fr]">
                    <Input
                      aria-label={t("quantity")}
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
                      aria-label={t("unit")}
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
                    <div className="flex items-start gap-1.5">
                      <Input
                        aria-label={t("ingredient")}
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
                        className="flex-1"
                      />
                      <DictationButton
                        fieldLabel="ingredient"
                        onAppend={(text) =>
                          appendIngredientItem(row.key, text)
                        }
                        className="mt-1"
                      />
                    </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
                      <Input
                        aria-label="Ingredient prep"
                        value={row.prep}
                        onChange={(e) =>
                          setIngredients((l) =>
                            l.map((r) =>
                              r.key === row.key
                                ? { ...r, prep: e.target.value }
                                : r,
                            ),
                          )
                        }
                        placeholder="Prep — diced, softened…"
                      />
                      <select
                        className={selectClass}
                        aria-label="Step that uses this ingredient"
                        value={row.stepPosition}
                        onChange={(e) =>
                          setIngredients((l) =>
                            l.map((r) =>
                              r.key === row.key
                                ? { ...r, stepPosition: e.target.value }
                                : r,
                            ),
                          )
                        }
                      >
                        <option value="">Any step</option>
                        {steps.map((_, si) => (
                          <option key={si} value={String(si + 1)}>
                            Step {si + 1}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <RowControls
                    objectLabel={t("ingredientObject")}
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
                      aria-label={t("step", { position: i + 1 })}
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
                    <div className="flex justify-end">
                      <DictationButton
                        fieldLabel={`step ${i + 1}`}
                        onAppend={(text) =>
                          appendStepInstruction(row.key, text)
                        }
                      />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input
                        aria-label={t("timerMinutes")}
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
                        aria-label={t("techniques")}
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
                    <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
                      <Input
                        aria-label="Target temperature in °C"
                        value={row.targetTempC}
                        onChange={(e) =>
                          setSteps((l) =>
                            l.map((r) =>
                              r.key === row.key
                                ? { ...r, targetTempC: e.target.value }
                                : r,
                            ),
                          )
                        }
                        placeholder="Target °C"
                        inputMode="numeric"
                      />
                      <Input
                        aria-label="Doneness cue"
                        value={row.doneness}
                        onChange={(e) =>
                          setSteps((l) =>
                            l.map((r) =>
                              r.key === row.key
                                ? { ...r, doneness: e.target.value }
                                : r,
                            ),
                          )
                        }
                        placeholder="Doneness — golden brown, springs back…"
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
                    objectLabel={t("stepObject")}
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

          <Field
            label="Notes"
            name="notes"
            hint="Tips, substitutions, the story behind it."
            error={errors.notes}
          >
            <Textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={3}
            />
          </Field>
          <div className="-mt-1 flex justify-end">
            <DictationButton
              fieldLabel="notes"
              onAppend={(text) => appendToField("notes", text)}
            />
          </div>

          <Field
            label="Story & memories"
            name="story"
            hint="Who it came from, when you make it, what it means — in your own words."
            error={errors.story}
          >
            <Textarea
              value={form.story}
              onChange={(e) => set("story", e.target.value)}
              placeholder="Nonna learned this from her mother in Calabria. We make it every Christmas Eve…"
              rows={4}
            />
          </Field>
          <div className="-mt-1 flex justify-end">
            <DictationButton
              fieldLabel="story"
              onAppend={(text) => appendToField("story", text)}
            />
          </div>

          <fieldset className="flex flex-col gap-3 rounded-xl border border-border bg-surface/40 p-4">
            <legend className="px-1 text-sm font-medium text-foreground">
              Handed down from
            </legend>
            <p className="text-xs text-muted-foreground">
              Who this recipe came from and roughly when — shown as a small
              heirloom label. All optional.
            </p>
            <Field label="Name" name="handedDownFrom" error={errors.handedDownFrom}>
              <Input
                value={form.handedDownFrom}
                onChange={(e) => set("handedDownFrom", e.target.value)}
                placeholder="Great-Grandma Rosa Bianchi"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="When" name="originYear" error={errors.originYear}>
                <Input
                  value={form.originYear}
                  onChange={(e) => set("originYear", e.target.value)}
                  placeholder="1935 or 1930s"
                />
              </Field>
              <Field label="Place" name="originPlace" error={errors.originPlace}>
                <Input
                  value={form.originPlace}
                  onChange={(e) => set("originPlace", e.target.value)}
                  placeholder="Calabria, Italy"
                />
              </Field>
            </div>
          </fieldset>
        </div>

        {/* Sidebar */}
        <aside className="flex h-fit flex-col gap-5 rounded-xl border border-border bg-surface/50 p-5 lg:sticky lg:top-20">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Servings" name="servings" error={errors.servings}>
              <Input
                value={form.servings}
                onChange={(e) => set("servings", e.target.value)}
                inputMode="numeric"
              />
            </Field>
            <Field label="Unit" name="servingsNoun" error={errors.servingsNoun}>
              <Input
                value={form.servingsNoun}
                onChange={(e) => set("servingsNoun", e.target.value)}
              />
            </Field>
            <Field
              label="Prep (min)"
              name="prepMinutes"
              error={errors.prepMinutes}
            >
              <Input
                value={form.prepMinutes}
                onChange={(e) => set("prepMinutes", e.target.value)}
                inputMode="numeric"
              />
            </Field>
            <Field
              label="Cook (min)"
              name="cookMinutes"
              error={errors.cookMinutes}
            >
              <Input
                value={form.cookMinutes}
                onChange={(e) => set("cookMinutes", e.target.value)}
                inputMode="numeric"
              />
            </Field>
            <Field
              label="Rest / inactive (min)"
              name="restMinutes"
              hint="Chilling, proving, resting — inactive time."
              error={errors.restMinutes}
            >
              <Input
                value={form.restMinutes}
                onChange={(e) => set("restMinutes", e.target.value)}
                inputMode="numeric"
              />
            </Field>
          </div>

          <Field
            label="Make-ahead"
            name="makeAheadNote"
            hint="What can be done in advance, and how far ahead."
            error={errors.makeAheadNote}
          >
            <Textarea
              value={form.makeAheadNote}
              onChange={(e) => set("makeAheadNote", e.target.value)}
              placeholder="Dough can be made up to 2 days ahead and kept chilled."
              rows={2}
            />
          </Field>

          <Field
            label="Equipment & tools"
            name="equipment"
            hint="Comma-separated. Shown as a gather-your-tools pass in Cook Mode."
            error={errors.equipment}
          >
            <Input
              value={form.equipment}
              onChange={(e) => set("equipment", e.target.value)}
              placeholder="stand mixer, 9-inch cake tin, bench scraper"
            />
          </Field>

          <Field label="Difficulty" name="difficulty" error={errors.difficulty}>
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

          <Field label="Cuisine" name="cuisine" error={errors.cuisine}>
            <Input
              value={form.cuisine}
              onChange={(e) => set("cuisine", e.target.value)}
              placeholder="Italian"
            />
          </Field>

          <div className="h-px bg-border" />

          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium text-foreground">
              Nutrition
              <span className="ms-1 font-normal text-muted-foreground">
                (per serving)
              </span>
            </legend>
            <p className="text-xs text-muted-foreground">
              Optional. Leave blank if you don&apos;t have the numbers.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {NUTRITION_FIELDS.map((f) => (
                <Field
                  key={f.key}
                  name={f.key}
                  label={`${f.label} (${f.unit})`}
                  error={errors[f.key]}
                >
                  <Input
                    value={form[f.key]}
                    onChange={(e) => set(f.key, e.target.value)}
                    inputMode="decimal"
                    placeholder="—"
                  />
                </Field>
              ))}
            </div>
          </fieldset>

          <div className="h-px bg-border" />

          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium text-foreground">
              Dietary
            </legend>
            <p className="text-xs text-muted-foreground">
              Declare what this recipe is suitable for. These power dietary
              filters and “safe for” badges — leave unchecked if unsure.
            </p>
            <div className="flex flex-wrap gap-2">
              {DIETARY_TAGS.map((tag) => {
                const checked = form.dietaryFlags.includes(tag);
                return (
                  <label
                    key={tag}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                      checked
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={checked}
                      onChange={() => toggleDietaryFlag(tag)}
                    />
                    {DIETARY_TAG_LABELS[tag]}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="h-px bg-border" />

          <Field label="Tags" name="tags" hint="Comma separated." error={errors.tags}>
            <Input
              id="recipe-field-tags"
              value={form.tags}
              onChange={(e) => set("tags", e.target.value)}
              placeholder="dinner, weeknight"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUGGESTED_TAGS.map((tag) => {
                const active = tagList.some(
                  (t) => t.toLowerCase() === tag.name.toLowerCase(),
                );
                return (
                  <button
                    key={tag.slug}
                    type="button"
                    onClick={() => toggleTag(tag.name)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors",
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </Field>

          <ImageUploadField
            label="Cover photo"
            hint="Upload a photo or paste an image URL."
            value={form.coverImageUrl}
            onChange={(url) => set("coverImageUrl", url)}
          />

          <div className="h-px bg-border" />

          <Field
            label="Who can see this?"
            name="visibility"
            error={errors.visibility}
          >
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
            <Field label="Group" name="groupId" error={errors.groupId}>
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

          <Field label="Status" name="status" error={errors.status}>
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

      {/* Sticky mobile action bar: keeps Save/Cancel in the thumb zone on
          small viewports where the top action row scrolls out of reach. It
          mirrors the top actions exactly — same form submission and shared
          `pending` state — and is hidden from md up where the top row stays
          visible. Bottom padding respects the home-indicator safe area; the
          BottomNav is suppressed on editor routes so this bar owns the bottom
          edge (issue #294). */}
      <div className="sticky bottom-0 z-30 -mx-4 mt-2 flex gap-2 border-t border-border bg-background/90 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/75 md:hidden">
        <Button
          type="button"
          variant="ghost"
          className="flex-1"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
        <Button type="submit" className="flex-1" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />}
          {mode === "edit" ? "Save changes" : "Save recipe"}
        </Button>
      </div>
    </form>
  );
}

function RowControls({
  onUp,
  onDown,
  onRemove,
  objectLabel,
}: {
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  objectLabel: string;
}) {
  const t = useTranslations("recipeEditor");
  return (
    <div className="flex shrink-0 items-center">
      <GripVertical className="hidden size-4 text-muted-foreground sm:block" />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={t("moveUpNamed", { object: objectLabel })}
        onClick={onUp}
      >
        <ChevronUp />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={t("moveDownNamed", { object: objectLabel })}
        onClick={onDown}
      >
        <ChevronDown />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={t("removeNamed", { object: objectLabel })}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={onRemove}
      >
        <Trash2 />
      </Button>
    </div>
  );
}

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  description: "Description",
  servings: "Servings",
  servingsNoun: "Unit",
  prepMinutes: "Prep (min)",
  cookMinutes: "Cook (min)",
  difficulty: "Difficulty",
  cuisine: "Cuisine",
  notes: "Notes",
  story: "Story & memories",
  handedDownFrom: "Handed down from",
  originYear: "When",
  originPlace: "Place",
  calories: "Calories",
  proteinGrams: "Protein",
  carbsGrams: "Carbs",
  fatGrams: "Fat",
  saturatedFatGrams: "Saturated fat",
  sodiumMg: "Sodium",
  sugarGrams: "Sugar",
  fiberGrams: "Fiber",
  tags: "Tags",
  visibility: "Who can see this?",
  groupId: "Group",
  status: "Status",
  ingredients: "Ingredients",
  steps: "Steps",
  dietaryFlags: "Dietary",
  coverImageUrl: "Cover photo",
};

// Fields that render a control with a matching `recipe-field-<key>` id, so the
// error-summary entry can be an anchor that focuses the offending control.
const ANCHORABLE_FIELDS = new Set([
  "title",
  "description",
  "servings",
  "servingsNoun",
  "prepMinutes",
  "cookMinutes",
  "difficulty",
  "cuisine",
  "notes",
  "story",
  "handedDownFrom",
  "originYear",
  "originPlace",
  "calories",
  "proteinGrams",
  "carbsGrams",
  "fatGrams",
  "saturatedFatGrams",
  "sodiumMg",
  "sugarGrams",
  "fiberGrams",
  "tags",
  "visibility",
  "groupId",
  "status",
]);

function prettifyFieldKey(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function Field({
  label,
  hint,
  error,
  required,
  name,
  children,
}: {
  label: string;
  hint?: string;
  error?: string[];
  required?: boolean;
  name?: string;
  children: React.ReactNode;
}) {
  const reactId = React.useId();
  const child = React.isValidElement(children)
    ? (children as React.ReactElement<Record<string, unknown>>)
    : null;
  const existingId =
    child && typeof child.props.id === "string" ? child.props.id : undefined;
  // Named fields get a deterministic id so the error summary can link to them.
  const controlId = existingId ?? (name ? `recipe-field-${name}` : reactId);
  const hasError = Boolean(error?.length);
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const describedBy = hasError ? errorId : hint ? hintId : undefined;
  const existingDescribedBy =
    child && typeof child.props["aria-describedby"] === "string"
      ? child.props["aria-describedby"]
      : undefined;

  // Thread the generated id + validation state onto the control so the label
  // association, required state, and error message are all programmatic.
  const control = child
    ? React.cloneElement(child, {
        id: controlId,
        "aria-required": required ? true : undefined,
        "aria-invalid": hasError ? true : undefined,
        "aria-describedby":
          [existingDescribedBy, describedBy].filter(Boolean).join(" ") ||
          undefined,
      })
    : children;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={controlId} className="flex items-center gap-1">
        {label}
        {required && (
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </Label>
      {control}
      {hint && !hasError && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {hasError ? (
        <p id={errorId} className={cn("text-xs text-destructive")}>
          {error![0]}
        </p>
      ) : null}
    </div>
  );
}
