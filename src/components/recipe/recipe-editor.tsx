'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  AlertCircle,
  Carrot,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  ChevronUp,
  Circle,
  Clock,
  Eye,
  Globe,
  History,
  Info,
  Layers,
  Link2,
  ListOrdered,
  Loader2,
  Lock,
  type LucideIcon,
  Pencil,
  Plus,
  Repeat,
  Save,
  Sparkles,
  Trash2,
  Users,
  Utensils,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { friendlyError } from '~/lib/error-copy';
import { pickKidCopy } from '~/config/kid-copy';
import { useThemeBehavior } from '~/components/theme/theme-provider';

import { cn, formatMinutes } from '~/lib/utils';
import { recipeDetailPath } from '~/lib/recipe-path';
import { useAutosaveDraft } from '~/lib/use-autosave-draft';
import { track } from '~/lib/analytics';
import {
  parseClassificationList,
  SUGGESTED_TAGS_BY_CATEGORY,
  type CanonicalTag,
} from '~/lib/tag-taxonomy';
import { type RecipeInput } from '~/server/recipes/validation';
import { DIETARY_TAGS, DIETARY_TAG_LABELS, type DietaryTag } from '~/lib/substitutions';
import { type ImportedRecipe } from '~/server/recipes/import';
import {
  convertAmount,
  dimensionOf,
  formatQuantity,
  listUnits,
  parseAmount,
  type CustomUnitDef,
} from '~/lib/units';
import { unitLabel } from '~/lib/unit-labels';
import { NUTRIENT_REGISTRY, type NutritionKey as RegistryNutritionKey } from '~/lib/nutrients';
import { getSuggestedUnitsForFood } from '~/lib/food-units';
import { createRecipeAction, updateRecipeAction } from '~/server/recipes/actions';
import { Button } from '~/components/ui/button';
import { CloseButton } from '~/components/ui/close-button';
import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import { NativeSelect } from '~/components/ui/native-select';
import { Textarea } from '~/components/ui/textarea';
import { Label } from '~/components/ui/label';
import { ImageUploadField } from '~/components/ui/image-upload';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';

/**
 * The upgrade prompt is only needed when a create hits the plan's recipe cap
 * (#318), so it's code-split out of the editor's first-load JS and fetched lazily
 * the first time it's shown.
 */
const UpgradeDialog = dynamic(() =>
  import('~/components/billing/upgrade-dialog').then((m) => m.UpgradeDialog),
);

const ImportRecipePanel = dynamic(
  () => import('~/components/recipe/import-recipe-panel').then((m) => m.ImportRecipePanel),
  { ssr: false },
);

// Preview mode is opt-in (toggled on demand), so the preview renderer, which
// mirrors the full recipe detail view, is code-split out of the editor's
// first-load JS and fetched only when the user first opens Preview.
const RecipePreview = dynamic(
  () => import('~/components/recipe/recipe-preview').then((m) => m.RecipePreview),
  { ssr: false },
);

type IngRow = {
  key: string;
  /** Stable editor-only id that groups rows into a named section container
   *  (#425). It is not persisted. The saved `section` string is re-derived into
   *  group ids on load, so two rows sharing a section name share a container. */
  groupId: string;
  section: string;
  quantity: string;
  quantityMax: string;
  unit: string;
  item: string;
  note: string;
  prep: string;
  stepPosition: string;
  optional: boolean;
};
type StepRow = {
  key: string;
  groupId: string;
  section: string;
  title: string;
  instruction: string;
  imageUrl: string;
  imageAlt: string;
  videoUrl: string;
  timerMinutes: string;
  targetTempC: string;
  doneness: string;
  techniques: string;
};

export type RecipeEditorValue = {
  title: string;
  description: string;
  coverImageUrl: string;
  coverImageAlt: string;
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
  difficulty: '' | 'easy' | 'medium' | 'hard';
  /** @deprecated Use the comma-separated `cuisines` editor value. */
  cuisine?: string;
  cuisines?: string;
  mealTypes?: string;
  sourceName: string;
  sourceUrl: string;
  notes: string;
  story?: string;
  handedDownFrom?: string;
  originYear?: string;
  originPlace?: string;
  visibility: 'private' | 'group' | 'unlisted' | 'public';
  status: 'draft' | 'published';
  groupId: string;
  tags: string;
  dietaryFlags: DietaryTag[];
  ingredients: Omit<IngRow, 'key' | 'groupId'>[];
  steps: Omit<StepRow, 'key' | 'groupId'>[];
};

let idCounter = 0;
const nextKey = () => `row-${idCounter++}`;

const EMPTY_ING: Omit<IngRow, 'key'> = {
  groupId: '',
  section: '',
  quantity: '',
  quantityMax: '',
  unit: '',
  item: '',
  note: '',
  prep: '',
  stepPosition: '',
  optional: false,
};
const EMPTY_STEP: Omit<StepRow, 'key'> = {
  groupId: '',
  section: '',
  title: '',
  instruction: '',
  imageUrl: '',
  imageAlt: '',
  videoUrl: '',
  timerMinutes: '',
  targetTempC: '',
  doneness: '',
  techniques: '',
};

/** Stable empty field-error map. The initial/cleared useActionState value. */
const NO_ERRORS: Record<string, string[]> = {};

type LoadedIngRow = Omit<IngRow, 'groupId'> & { groupId?: string };
type LoadedStepRow = Omit<StepRow, 'groupId'> & { groupId?: string };

/**
 * Reorder rows so rows sharing a `groupId` are contiguous, keeping the
 * first-appearance order of groups. Mirrors how the read side buckets by section
 * (a Map keyed on the section name), so the editor preview matches the saved view.
 */
function partitionByGroup<T extends { groupId: string }>(rows: T[]): T[] {
  const order: string[] = [];
  const byId = new Map<string, T[]>();
  for (const r of rows) {
    if (!byId.has(r.groupId)) {
      byId.set(r.groupId, []);
      order.push(r.groupId);
    }
    byId.get(r.groupId)!.push(r);
  }
  return order.flatMap((id) => byId.get(id)!);
}

/**
 * Hydrate loaded rows with an editor-only `groupId` derived from their saved
 * section name (same non-empty name → same group), then partition so each
 * group's rows are contiguous. Ungrouped rows (blank section) share id "".
 */
function hydrateIngredientGroups(rows: LoadedIngRow[]): IngRow[] {
  const idBySection = new Map<string, string>();
  const withIds: IngRow[] = rows.map((r) => {
    const section = r.section.trim();
    if (section === '') return { ...r, section: '', groupId: '' };
    let groupId = idBySection.get(section);
    if (!groupId) {
      groupId = nextKey();
      idBySection.set(section, groupId);
    }
    return { ...r, section, groupId };
  });
  return partitionByGroup(withIds);
}

/** Steps mirror of {@link hydrateIngredientGroups}: derive an editor-only
 *  `groupId` from each saved section name and partition so a section's steps
 *  stay contiguous. Ungrouped steps (blank section) share id "". */
function hydrateStepGroups(rows: LoadedStepRow[]): StepRow[] {
  const idBySection = new Map<string, string>();
  const withIds: StepRow[] = rows.map((r) => {
    const section = r.section.trim();
    if (section === '') return { ...r, section: '', groupId: '' };
    let groupId = idBySection.get(section);
    if (!groupId) {
      groupId = nextKey();
      idBySection.set(section, groupId);
    }
    return { ...r, section, groupId };
  });
  return partitionByGroup(withIds);
}

/** Split rows into consecutive group blocks for rendering (relies on the
 *  contiguity invariant that {@link partitionByGroup} and the mutation
 *  handlers maintain). The blank-id block renders as loose, un-boxed rows. */
function blocksByGroup<T extends { groupId: string; section: string }>(
  rows: T[],
): { groupId: string; section: string; rows: T[] }[] {
  const blocks: { groupId: string; section: string; rows: T[] }[] = [];
  for (const row of rows) {
    const last = blocks[blocks.length - 1];
    if (last?.groupId === row.groupId) last.rows.push(row);
    else blocks.push({ groupId: row.groupId, section: row.section, rows: [row] });
  }
  return blocks;
}

/**
 * The per-serving nutrition keys shared by {@link RecipeEditorValue}, the editor
 * form state, and the payload builder. Derived from the nutrient registry
 * (#1028) so a new nutrient reaches the editor from one declaration.
 */
type NutritionKey = RegistryNutritionKey;

/**
 * Per-serving nutrition inputs (issue #414). Projected from the registry so the
 * editor state, payload builder, and UI stay in sync with the roll-up and the
 * facts panel. `unit` is shown as a suffix hint so a cook knows whether a field
 * wants grams or milligrams.
 */
const NUTRITION_FIELDS: readonly { key: NutritionKey; unit: string }[] = NUTRIENT_REGISTRY.map(
  (n) => ({ key: n.nutritionKey, unit: n.unit }),
);

function numOrUndef(s: string): number | undefined {
  const t = s.trim();
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** Fraction-aware amount parse for ingredient quantities ("1 1/2", "½", "0.5"). */
function amountOrUndef(s: string): number | undefined {
  return parseAmount(s) ?? undefined;
}

const selectClass =
  'h-11 w-full rounded-lg border border-input bg-background px-3 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm';

/** Trigger icon for the consolidated visibility settings popdown. */
const VISIBILITY_ICON = {
  private: Lock,
  group: Users,
  unlisted: Link2,
  public: Globe,
} as const;

/**
 * Dietary tags surfaced in the editor's primary (collapsed) view. The rest.
 * egg-free plus the allergen-free declarations. Live behind the "more options"
 * disclosure. Kept as an explicit ordered list (not a filter over DIETARY_TAGS)
 * so the primary chips read Vegan · Vegetarian · Gluten-free · Dairy-free
 * regardless of the canonical badge order.
 */
const PRIMARY_DIETARY_TAGS: readonly DietaryTag[] = [
  'vegan',
  'vegetarian',
  'gluten-free',
  'dairy-free',
];

/**
 * Compact labelled wrapper for the dense ingredient/step row fields (#425). A
 * small sentence-case header sits above each control so its placeholder can read
 * as an obvious example ("e.g. …") instead of looking like a pre-filled value.
 * The <label> wraps the control, so clicking the header focuses it and the
 * visible text becomes the control's accessible name.
 */
function RowField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/**
 * A small ⓘ affordance that reveals a short explanatory hint on click/tap or
 * keyboard focus (#425, round 10). Replaces always-on descriptive paragraphs
 * beside a field label so the form stays uncluttered while the guidance stays
 * one tap away. Uses a Popover (not a hover-only Tooltip) so it works on touch.
 */
function InfoHint({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useTranslations('recipeEditor');
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('about', { label })}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Info className="size-4" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 text-sm leading-relaxed text-muted-foreground">
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** One entry in the in-editor section navigator (#112). */
type EditorSection = {
  /** DOM id of the section this anchor jumps to. */
  id: string;
  /** Short human label shown in the navigator. */
  label: string;
  /** Whether the section has any user content yet (drives the progress cue). */
  complete: boolean;
  /** Optional sections don't count against the "core" completion nudge. */
  optional?: boolean;
};

/**
 * In-editor section navigator + progress cue for the long recipe form (#112).
 * Purely presentational and additive: it reads live completion booleans derived
 * from the existing form state (no new sources of truth) and renders anchor
 * links plus a progress bar so writers can see how far along they are and jump
 * between Basics / Ingredients / Steps / Details without endless scrolling.
 *
 * Anchors call `onJump`, which scrolls with a runtime offset for the (variable
 * height) sticky app header + this bar so the target heading never hides behind
 * them and jumps don't overshoot. It sits above the autosave/dictation
 * machinery and touches none of it.
 */
function EditorSectionNav({
  sections,
  topOffset,
  onJump,
}: {
  sections: EditorSection[];
  topOffset: number;
  onJump: (id: string) => void;
}) {
  const t = useTranslations('recipeEditor.nav');
  const done = sections.filter((s) => s.complete).length;
  const total = sections.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const panelId = React.useId();
  // Always starts expanded on every visit (no persistence).
  const [collapsed, setCollapsed] = React.useState(false);
  const toggle = React.useCallback(() => setCollapsed((v) => !v), []);

  // Only wear the "docked" flush look (square top, no top border) once the bar
  // is actually pinned under the header. In its natural in-flow position it
  // stays a normal rounded card, so it never looks like a cut-off panel.
  const navRef = React.useRef<HTMLElement>(null);
  const [stuck, setStuck] = React.useState(false);
  React.useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    let raf = 0;
    const check = () => {
      raf = 0;
      const isLg =
        typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1024px)').matches;
      setStuck(isLg && el.getBoundingClientRect().top <= topOffset - 0.5);
    };
    const onScroll = () => {
      if (!raf) raf = window.requestAnimationFrame(check);
    };
    check();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [topOffset]);

  // Collapsing only makes sense while the bar is pinned under the header. Once
  // it un-pins (scrolled back up past its natural spot), spring it open again.
  React.useEffect(() => {
    if (!stuck) setCollapsed(false);
  }, [stuck]);

  return (
    <nav
      ref={navRef}
      aria-label={t('aria')}
      // When pinned, sit flush under the sticky site header sharing its glass
      // finish (the 1px overlap closes the hairline seam). When not pinned it
      // stays a normal rounded card so it never looks like a cut-off panel.
      style={{ top: topOffset - 1 }}
      className={cn(
        'overflow-hidden rounded-xl border border-border shadow-token-sm lg:sticky lg:z-20',
        stuck
          ? 'bg-card/85 backdrop-blur supports-[backdrop-filter]:bg-card/70 lg:rounded-t-none lg:border-t-0'
          : 'bg-card',
      )}
    >
      {collapsed ? (
        /* Collapsed: an ~12px progress sliver. The whole strip re-opens the
           section list. */
        <button
          type="button"
          onClick={toggle}
          aria-expanded={false}
          aria-controls={panelId}
          aria-label={t('progressAria', { done, total })}
          title={t('show')}
          className="group flex min-h-0 w-full items-center px-3 py-[3px] transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:px-4"
        >
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <span
              className="block h-full rounded-full bg-primary transition-[width] duration-500 ease-standard motion-reduce:transition-none"
              style={{ width: `${pct}%` }}
            />
          </span>
        </button>
      ) : (
        /* Expanded: progress bar + count + collapse control. */
        <div className="flex items-center gap-3 px-3 py-2 lg:px-4">
          <span
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={done}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label={t('barAria', { done, total })}
          >
            <span
              className="block h-full rounded-full bg-primary transition-[width] duration-500 ease-standard motion-reduce:transition-none"
              style={{ width: `${pct}%` }}
            />
          </span>
          <span
            className="text-xs font-medium tabular-nums text-muted-foreground"
            aria-hidden="true"
          >
            {done}/{total}
          </span>
          <button
            type="button"
            onClick={toggle}
            aria-expanded={true}
            aria-controls={panelId}
            className="-me-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span className="sr-only">{t('hide')}</span>
            <ChevronUp className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Collapsible section links. Height animates via grid-rows. The inner
          region is inert when hidden so keyboard/AT skip the off-screen links. */}
      <div
        id={panelId}
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-standard motion-reduce:transition-none',
          collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]',
        )}
      >
        <div className="overflow-hidden" inert={collapsed}>
          <div className="flex flex-col gap-2 px-3 pb-3 lg:px-4">
            <span className="text-xs font-medium text-muted-foreground">
              {done === total ? t('allStarted') : t('jump')}
            </span>
            <ul className="flex flex-wrap gap-1.5">
              {sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    onClick={(event) => {
                      event.preventDefault();
                      onJump(section.id);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    {section.complete ? (
                      <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    ) : (
                      <Circle
                        className="size-4 shrink-0 text-muted-foreground/50"
                        aria-hidden="true"
                      />
                    )}
                    {section.label}
                    <span className="sr-only">
                      {section.complete
                        ? t('srStarted')
                        : section.optional
                          ? t('srOptionalNotStarted')
                          : t('srNotStarted')}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </nav>
  );
}

export function RecipeEditor({
  mode,
  recipeId,
  initial,
  initialCoverImageUrl,
  initialTitle,
  initialImportUrl,
  groups = [],
  customUnits = [],
}: {
  mode: 'create' | 'edit';
  recipeId?: string;
  initial?: RecipeEditorValue;
  /** Pre-filled cover (e.g. a photo shared into the PWA share target). */
  initialCoverImageUrl?: string;
  /** Pre-filled title (e.g. seeded from a searched-but-missing recipe, #103). */
  initialTitle?: string;
  /** Recipe URL shared into the PWA to import from on mount (#50/#55). */
  initialImportUrl?: string;
  groups?: { id: string; name: string }[];
  /** The author's saved custom units, offered in the unit picker (e.g. "pinch"). */
  customUnits?: CustomUnitDef[];
}) {
  const router = useRouter();
  const t = useTranslations('recipeEditor');
  const { kidSafe } = useThemeBehavior();
  const [upgrade, setUpgrade] = React.useState<string | null>(null);
  const [previewMode, setPreviewMode] = React.useState(false);
  const errorSummaryRef = React.useRef<HTMLDivElement>(null);

  // Editor-open is the top of the creation/edit funnel (#310).
  React.useEffect(() => {
    track('editor_opened', { mode });
  }, [mode]);

  const [form, setForm] = React.useState(() => ({
    title: initial?.title ?? initialTitle ?? '',
    description: initial?.description ?? '',
    coverImageUrl: initial?.coverImageUrl ?? initialCoverImageUrl ?? '',
    coverImageAlt: initial?.coverImageAlt ?? '',
    servings: initial?.servings ?? '4',
    servingsNoun: initial?.servingsNoun ?? 'servings',
    prepMinutes: initial?.prepMinutes ?? '',
    cookMinutes: initial?.cookMinutes ?? '',
    restMinutes: initial?.restMinutes ?? '',
    makeAheadNote: initial?.makeAheadNote ?? '',
    equipment: initial?.equipment ?? '',
    calories: initial?.calories ?? '',
    proteinGrams: initial?.proteinGrams ?? '',
    carbsGrams: initial?.carbsGrams ?? '',
    fatGrams: initial?.fatGrams ?? '',
    saturatedFatGrams: initial?.saturatedFatGrams ?? '',
    sodiumMg: initial?.sodiumMg ?? '',
    sugarGrams: initial?.sugarGrams ?? '',
    fiberGrams: initial?.fiberGrams ?? '',
    difficulty: initial?.difficulty ?? '',
    cuisines: initial?.cuisines ?? initial?.cuisine ?? '',
    mealTypes: initial?.mealTypes ?? '',
    sourceName: initial?.sourceName ?? '',
    sourceUrl: initial?.sourceUrl ?? '',
    notes: initial?.notes ?? '',
    story: initial?.story ?? '',
    handedDownFrom: initial?.handedDownFrom ?? '',
    originYear: initial?.originYear ?? '',
    originPlace: initial?.originPlace ?? '',
    visibility: initial?.visibility ?? 'private',
    status: initial?.status ?? 'published',
    groupId: initial?.groupId ?? '',
    tags: initial?.tags ?? '',
    dietaryFlags: initial?.dietaryFlags ?? [],
  }));

  const [ingredients, setIngredients] = React.useState<IngRow[]>(() =>
    hydrateIngredientGroups(
      (initial?.ingredients?.length ? initial.ingredients : [EMPTY_ING]).map((r) => ({
        ...r,
        key: nextKey(),
      })),
    ),
  );
  const [steps, setSteps] = React.useState<StepRow[]>(() =>
    hydrateStepGroups(
      (initial?.steps?.length ? initial.steps : [EMPTY_STEP]).map((r) => ({
        ...r,
        key: nextKey(),
      })),
    ),
  );

  // Row-level UI state for the redesigned lists (#425): step rows can reveal an
  // opt-in group-heading field, and ingredient rows expand advanced options.
  // Keyed by stable row key so reordering and removal never mismatch a row.
  const [openStepOptions, setOpenStepOptions] = React.useState<Set<string>>(() => new Set());
  const [openIngOptions, setOpenIngOptions] = React.useState<Set<string>>(() => new Set());

  const toggleInSet =
    (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (key: string, on?: boolean) =>
      setter((prev) => {
        const next = new Set(prev);
        const shouldAdd = on ?? !next.has(key);
        if (shouldAdd) next.add(key);
        else next.delete(key);
        return next;
      });
  const toggleStepOptions = toggleInSet(setOpenStepOptions);
  const toggleIngOptions = toggleInSet(setOpenIngOptions);

  // The sticky app header wraps to two or three rows at some widths, so its
  // height is dynamic (64–245px observed). Track it live and offset the section
  // navigator + anchor jumps from it. A hard-coded top-16 buried the nav behind
  // the header and made section jumps overshoot (user report).
  const [appHeaderH, setAppHeaderH] = React.useState(64);
  React.useEffect(() => {
    const header = document.querySelector('header');
    if (!header) return;
    const measure = () => setAppHeaderH(Math.round(header.getBoundingClientRect().height));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);

  const jumpToSection = React.useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const header = document.querySelector('header');
    const nav = document.querySelector('nav[aria-label="Recipe sections"]');
    const headerH = header?.getBoundingClientRect().height ?? 0;
    const lg = window.matchMedia('(min-width: 1024px)').matches;
    const navH = lg ? (nav?.getBoundingClientRect().height ?? 0) : 0;
    const offset = headerH + navH + 12;
    const top = window.scrollY + el.getBoundingClientRect().top - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, []);

  // Auto-save & draft recovery (#421): mirror the in-progress editor value to
  // localStorage (debounced) so a locked phone or a stray "back" tap never
  // loses a half-typed recipe. Drafts are namespaced so new vs. edit can't mix.
  const draftKey = mode === 'edit' && recipeId ? recipeId : 'new';
  const draftSnapshot: RecipeEditorValue = React.useMemo(
    () => ({
      ...form,
      ingredients: ingredients.map(({ key: _key, groupId: _groupId, ...rest }) => rest),
      steps: steps.map(({ key: _key, groupId: _groupId, ...rest }) => rest),
    }),
    [form, ingredients, steps],
  );
  const draftJson = React.useMemo(() => JSON.stringify(draftSnapshot), [draftSnapshot]);
  const [initialDraftJson] = React.useState(() => draftJson);
  const draftDirty = draftJson !== initialDraftJson;
  const draft = useAutosaveDraft<RecipeEditorValue>({
    key: draftKey,
    snapshot: draftSnapshot,
    dirty: draftDirty,
  });

  function restoreDraft(value: RecipeEditorValue) {
    const { ingredients: draftIngredients, steps: draftSteps, ...scalars } = value;
    setForm((f) => ({ ...f, ...scalars }));
    setIngredients(
      hydrateIngredientGroups(
        (draftIngredients ?? []).map((r) => ({
          ...EMPTY_ING,
          ...r,
          key: nextKey(),
        })),
      ),
    );
    setSteps(
      hydrateStepGroups(
        (draftSteps ?? []).map((r) => ({
          ...EMPTY_STEP,
          ...r,
          key: nextKey(),
        })),
      ),
    );
    draft.acceptDraft();
    toast.success(t('toast.draftRestored'));
  }

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // "Estimate from ingredients": fill the manual per-serving nutrition fields
  // from the current ingredient list, so the cook gets a starting point they can
  // adjust rather than typing every macro. Goes through the same single entry
  // point the recipe page uses (#1029); an unsaved draft has no food-graph link,
  // so only the text rung is available here. Unrecognized foods and unweighable
  // amounts are skipped, so the estimate is best-effort.
  async function estimateNutritionFromIngredients() {
    const servings = parseAmount(form.servings) ?? 1;
    // Dynamically import the curated food dataset so it stays out of the
    // editor's first-load JS bundle. It's only needed on this click.
    const { resolveNutritionView } = await import('~/lib/recipe-nutrition');
    const view = resolveNutritionView({
      ingredients: ingredients.map((r) => ({
        item: r.item,
        quantity: parseAmount(r.quantity),
        unit: r.unit,
      })),
      servings,
    });
    if (view.provenance.source !== 'estimate') {
      toast.error(t('toast.estimateError'));
      return;
    }
    const { sourcedLines, totalLines, confidence } = view.provenance;
    const round = (n: number, decimals = 0) => {
      const f = 10 ** decimals;
      return String(Math.round(n * f) / f);
    };
    const n = view.perServing;
    setForm((f) => {
      const next = { ...f };
      // Registry-driven (#1028) rather than a hand-written field list. The old
      // list silently omitted saturated fat, which is half of why the column was
      // stranded: even a satFat-carrying estimate had nowhere to land.
      for (const nutrient of NUTRIENT_REGISTRY) {
        const value = n[nutrient.nutritionKey];
        if (value == null) continue;
        next[nutrient.nutritionKey] = round(value, nutrient.displayPrecision);
      }
      return next;
    });
    const pct = Math.round(confidence * 100);
    toast.success(
      sourcedLines < totalLines
        ? t('toast.estimatedPartial', {
            sourced: sourcedLines,
            total: totalLines,
            percent: pct,
          })
        : t('toast.estimated'),
    );
  }

  const commaList = parseClassificationList;
  const tagList = commaList(form.tags);
  const cuisineList = commaList(form.cuisines);
  const mealTypeList = commaList(form.mealTypes);

  function toggleClassification(
    key: 'tags' | 'cuisines' | 'mealTypes',
    values: string[],
    name: string,
  ) {
    const has = values.some((value) => value.toLowerCase() === name.toLowerCase());
    const next = has
      ? values.filter((value) => value.toLowerCase() !== name.toLowerCase())
      : [...values, name];
    set(key, next.join(', '));
  }

  function toggleDietaryFlag(tag: DietaryTag) {
    setForm((f) => ({
      ...f,
      dietaryFlags: f.dietaryFlags.includes(tag)
        ? f.dietaryFlags.filter((t) => t !== tag)
        : [...f.dietaryFlags, tag],
    }));
  }

  // Dietary: the main view shows the common declarations (Vegan, Vegetarian,
  // Gluten-free, Dairy-free). Egg-free and the allergen-free tags sit behind a
  // disclosure so the section stays uncluttered (round 10). Expanding appends
  // the rest after the primary four (no reflow). Auto-open when editing a recipe
  // that already declares a non-primary flag so nothing hides.
  const [showMoreDietary, setShowMoreDietary] = React.useState(() =>
    (initial?.dietaryFlags ?? []).some((t) => !PRIMARY_DIETARY_TAGS.includes(t)),
  );
  const dietaryTagsShown = showMoreDietary
    ? [...PRIMARY_DIETARY_TAGS, ...DIETARY_TAGS.filter((t) => !PRIMARY_DIETARY_TAGS.includes(t))]
    : PRIMARY_DIETARY_TAGS;
  const VisibilityIcon = VISIBILITY_ICON[form.visibility];

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
      cuisines: v.cuisines || v.cuisine || f.cuisines,
      mealTypes: v.mealTypes || f.mealTypes,
      sourceName: v.sourceName || f.sourceName,
      sourceUrl: v.sourceUrl || f.sourceUrl,
      tags: v.tags || f.tags,
    }));
    if (v.ingredients.length)
      setIngredients(
        hydrateIngredientGroups(v.ingredients.map((r) => ({ ...EMPTY_ING, ...r, key: nextKey() }))),
      );
    if (v.steps.length)
      setSteps(hydrateStepGroups(v.steps.map((r) => ({ ...EMPTY_STEP, ...r, key: nextKey() }))));
  }

  // Steps mirror the ingredient grouping handlers below: an explicit per-step
  // Section picker (not positional headings) drives grouping, arrows are
  // block-bounded, and each mutation keeps same-group steps contiguous so the
  // global 1..N numbering (shared with the ingredient "Used in step" picker and
  // the read-side list) stays stable and predictable.
  function moveStep(key: string, dir: -1 | 1) {
    setSteps((l) => {
      const i = l.findIndex((r) => r.key === key);
      if (i < 0) return l;
      const j = i + dir;
      if (j < 0 || j >= l.length) return l;
      if (l[j]!.groupId !== l[i]!.groupId) return l;
      const copy = [...l];
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      return copy;
    });
  }

  function assignStepToGroup(rowKey: string, targetGroupId: string) {
    setSteps((l) => {
      const section =
        targetGroupId === '' ? '' : (l.find((r) => r.groupId === targetGroupId)?.section ?? '');
      return partitionByGroup(
        l.map((r) => (r.key === rowKey ? { ...r, groupId: targetGroupId, section } : r)),
      );
    });
  }

  function createGroupFromStep(rowKey: string) {
    const gid = nextKey();
    setSteps((l) =>
      partitionByGroup(l.map((r) => (r.key === rowKey ? { ...r, groupId: gid, section: '' } : r))),
    );
    requestAnimationFrame(() => {
      document.getElementById(`step-group-name-${gid}`)?.focus();
    });
  }

  function addStep() {
    setSteps((l) =>
      partitionByGroup([...l, { ...EMPTY_STEP, key: nextKey(), groupId: '', section: '' }]),
    );
  }

  function addStepToGroup(groupId: string, section: string) {
    setSteps((l) => {
      const row = { ...EMPTY_STEP, key: nextKey(), groupId, section };
      let lastIdx = -1;
      for (let i = 0; i < l.length; i++) if (l[i]!.groupId === groupId) lastIdx = i;
      if (lastIdx === -1) return [...l, row];
      const copy = [...l];
      copy.splice(lastIdx + 1, 0, row);
      return copy;
    });
  }

  function addStepGroup() {
    const gid = nextKey();
    setSteps((l) => [...l, { ...EMPTY_STEP, key: nextKey(), groupId: gid, section: '' }]);
    requestAnimationFrame(() => {
      document.getElementById(`step-group-name-${gid}`)?.focus();
    });
  }

  function renameStepGroup(groupId: string, name: string) {
    setSteps((l) => l.map((r) => (r.groupId === groupId ? { ...r, section: name } : r)));
  }

  function dissolveStepGroup(groupId: string) {
    setSteps((l) =>
      partitionByGroup(
        l.map((r) => (r.groupId === groupId ? { ...r, groupId: '', section: '' } : r)),
      ),
    );
  }

  // Move an ingredient up/down only *within* its own group block. Reordering no
  // longer changes a row's group (that was confusing). Grouping is done solely
  // with the explicit per-row group picker below (#425). The swap is a no-op at a
  // block edge (the arrows are also disabled there via block-relative first/last).
  function moveIngredient(key: string, dir: -1 | 1) {
    setIngredients((l) => {
      const i = l.findIndex((r) => r.key === key);
      if (i < 0) return l;
      const j = i + dir;
      if (j < 0 || j >= l.length) return l;
      if (l[j]!.groupId !== l[i]!.groupId) return l;
      const copy = [...l];
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      return copy;
    });
  }

  // Reassign a single row to a different group (or ungroup it with target "").
  // The row adopts the target group's current name, then we re-partition so it
  // physically moves into that group's contiguous block. This is the explicit
  // "add an existing ingredient to a group" the reorder model couldn't do (#425).
  function assignIngredientToGroup(rowKey: string, targetGroupId: string) {
    setIngredients((l) => {
      const section =
        targetGroupId === '' ? '' : (l.find((r) => r.groupId === targetGroupId)?.section ?? '');
      return partitionByGroup(
        l.map((r) => (r.key === rowKey ? { ...r, groupId: targetGroupId, section } : r)),
      );
    });
  }

  // Wrap a single existing row in a brand-new group and focus its name field, so
  // "+ New group" from the row picker both creates the group and moves the row in.
  function createGroupFromIngredient(rowKey: string) {
    const gid = nextKey();
    setIngredients((l) =>
      partitionByGroup(l.map((r) => (r.key === rowKey ? { ...r, groupId: gid, section: '' } : r))),
    );
    requestAnimationFrame(() => {
      document.getElementById(`ing-group-name-${gid}`)?.focus();
    });
  }

  // Unit picker options: every built-in unit plus the author's own custom units,
  // offered as datalist suggestions so the field is pickable yet still accepts a
  // free-typed unit the catalog doesn't know (recipes carry all sorts).
  const unitOptions = React.useMemo(() => {
    const builtIns = listUnits().map((u) => ({
      value: u.id,
      label: unitLabel(u.id),
    }));
    const customs = customUnits.map((c) => ({
      value: c.name,
      label: c.abbreviation ? `${c.name} (${c.abbreviation})` : c.name,
    }));
    return [...builtIns, ...customs];
  }, [customUnits]);
  const unitDatalistId = React.useId();

  // Food-type unit groupings: when a row names a food the food graph knows,
  // surface that food's most-appropriate units first in its unit picker (index
  // 0 = smartest default), then the rest of the catalog. Keyed by the food name
  // so rows sharing an ingredient reuse the same computed option list. Rows with
  // no food match fall back to the shared catalog datalist.
  const foodUnitOptionsByItem = React.useMemo(() => {
    const cache = new Map<string, { value: string; label: string }[] | null>();
    for (const r of ingredients) {
      const key = r.item.trim().toLowerCase();
      if (!key || cache.has(key)) continue;
      const suggestions = getSuggestedUnitsForFood(r.item);
      if (suggestions.length === 0) {
        cache.set(key, null);
        continue;
      }
      const seen = new Set<string>();
      const suggested: { value: string; label: string }[] = [];
      for (const s of suggestions) {
        const value = s.unit.trim();
        if (!value || seen.has(value)) continue;
        seen.add(value);
        suggested.push({ value, label: unitLabel(value) });
      }
      const rest = unitOptions.filter((o) => !seen.has(o.value));
      cache.set(key, [...suggested, ...rest]);
    }
    return cache;
  }, [ingredients, unitOptions]);

  // "Convert old amount?" affordance, per ingredient row. When a cook swaps a
  // unit for a compatible one and there's an amount to carry over, we stash the
  // converted value. The chip clears the moment the amount is edited or the unit
  // changes again, matching the requested "disappears when the amount changes".
  const [convertHints, setConvertHints] = React.useState<
    Record<string, { fromLabel: string; fromUnit: string; toUnit: string; toLabel: string }>
  >({});

  function clearConvertHint(key: string) {
    setConvertHints((h) => {
      if (!(key in h)) return h;
      const { [key]: _removed, ...rest } = h;
      return rest;
    });
  }

  function changeIngredientUnit(row: IngRow, nextUnit: string) {
    setIngredients((l) => l.map((r) => (r.key === row.key ? { ...r, unit: nextUnit } : r)));
    const amount = parseAmount(row.quantity);
    const fromUnit = row.unit.trim();
    const toUnit = nextUnit.trim();
    const sameUnit = fromUnit.toLowerCase() === toUnit.toLowerCase();
    if (amount == null || fromUnit === '' || toUnit === '' || sameUnit) {
      clearConvertHint(row.key);
      return;
    }
    const converted = convertAmount(amount, fromUnit, toUnit, customUnits);
    // Only offer the swap when the dimensions actually line up (null) and the
    // number would genuinely change. A no-op conversion isn't worth a prompt.
    if (converted == null || dimensionOf(fromUnit, customUnits) == null) {
      clearConvertHint(row.key);
      return;
    }
    setConvertHints((h) => ({
      ...h,
      [row.key]: {
        fromLabel: row.quantity.trim(),
        fromUnit,
        toUnit,
        toLabel: formatQuantity(converted, toUnit),
      },
    }));
  }

  function changeIngredientQuantity(row: IngRow, nextQuantity: string) {
    setIngredients((l) => l.map((r) => (r.key === row.key ? { ...r, quantity: nextQuantity } : r)));
    clearConvertHint(row.key);
  }

  function applyConvertHint(rowKey: string) {
    const hint = convertHints[rowKey];
    if (!hint) return;
    setIngredients((l) => l.map((r) => (r.key === rowKey ? { ...r, quantity: hint.toLabel } : r)));
    clearConvertHint(rowKey);
  }

  // Append a new ungrouped ingredient, then partition so it joins the single
  // ungrouped block (never spawns a second one) even when a group sits above.
  function addIngredient() {
    setIngredients((l) =>
      partitionByGroup([...l, { ...EMPTY_ING, key: nextKey(), groupId: '', section: '' }]),
    );
  }

  // Insert a fresh row directly after the last row of the target group so the
  // group's own "+ Add ingredient" always lands inside that group's span (#425).
  function addIngredientToGroup(groupId: string, section: string) {
    setIngredients((l) => {
      const row = { ...EMPTY_ING, key: nextKey(), groupId, section };
      let lastIdx = -1;
      for (let i = 0; i < l.length; i++) if (l[i]!.groupId === groupId) lastIdx = i;
      if (lastIdx === -1) return [...l, row];
      const copy = [...l];
      copy.splice(lastIdx + 1, 0, row);
      return copy;
    });
  }

  // Start a new, empty named group at the end of the list and focus its name
  // input so the user can title it immediately (fixes the "janky" group naming).
  function addIngredientGroup() {
    const gid = nextKey();
    setIngredients((l) => [...l, { ...EMPTY_ING, key: nextKey(), groupId: gid, section: '' }]);
    requestAnimationFrame(() => {
      document.getElementById(`ing-group-name-${gid}`)?.focus();
    });
  }

  // Rename a group in place: only the section string changes, never groupId, so
  // the name <input> stays mounted mid-keystroke (no focus loss / remount jank).
  function renameIngredientGroup(groupId: string, name: string) {
    setIngredients((l) => l.map((r) => (r.groupId === groupId ? { ...r, section: name } : r)));
  }

  // Dissolve a group's container without deleting its rows: clear their group id
  // + section, then re-partition so they merge into the trailing ungrouped block.
  function dissolveIngredientGroup(groupId: string) {
    setIngredients((l) =>
      partitionByGroup(
        l.map((r) => (r.groupId === groupId ? { ...r, groupId: '', section: '' } : r)),
      ),
    );
  }

  function buildPayload(): RecipeInput {
    return {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      coverImageUrl: form.coverImageUrl.trim() || undefined,
      coverImageAlt: form.coverImageAlt.trim() || undefined,
      servings: numOrUndef(form.servings),
      servingsNoun: form.servingsNoun.trim() || undefined,
      prepMinutes: numOrUndef(form.prepMinutes),
      cookMinutes: numOrUndef(form.cookMinutes),
      restMinutes: numOrUndef(form.restMinutes),
      makeAheadNote: form.makeAheadNote.trim() || undefined,
      equipment: form.equipment
        .split(',')
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
      cuisine: commaList(form.cuisines)[0],
      cuisines: commaList(form.cuisines),
      mealTypes: commaList(form.mealTypes),
      sourceName: form.sourceName.trim() || undefined,
      sourceUrl: form.sourceUrl.trim() || undefined,
      notes: form.notes.trim() || undefined,
      story: form.story.trim() || undefined,
      handedDownFrom: form.handedDownFrom.trim() || undefined,
      originYear: form.originYear.trim() || undefined,
      originPlace: form.originPlace.trim() || undefined,
      visibility: form.visibility,
      status: form.status,
      groupId: form.visibility === 'group' && form.groupId ? form.groupId : undefined,
      tags: commaList(form.tags),
      dietaryFlags: form.dietaryFlags,
      ingredients: ingredients
        .filter((r) => r.item.trim() !== '')
        .map((r) => ({
          section: r.section.trim() || undefined,
          quantity: amountOrUndef(r.quantity),
          quantityMax: amountOrUndef(r.quantityMax),
          unit: r.unit.trim() || undefined,
          item: r.item.trim(),
          note: r.note.trim() || undefined,
          prep: r.prep.trim() || undefined,
          stepPosition: numOrUndef(r.stepPosition),
          optional: r.optional,
        })),
      steps: steps
        .filter((r) => r.instruction.trim() !== '')
        .map((r) => ({
          section: r.section.trim() || undefined,
          title: r.title.trim() || undefined,
          instruction: r.instruction.trim(),
          imageUrl: r.imageUrl.trim() || undefined,
          imageAlt: r.imageAlt.trim() || undefined,
          videoUrl: r.videoUrl.trim() || undefined,
          timerSeconds: r.timerMinutes.trim() ? Math.round(Number(r.timerMinutes) * 60) : undefined,
          targetTempC: numOrUndef(r.targetTempC),
          doneness: r.doneness.trim() || undefined,
          techniques: r.techniques
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        })),
    };
  }

  // Keep the payload builder fresh for the action closure without recreating
  // the action each render. BuildPayload closes over the latest form /
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
        toast.error(pickKidCopy(kidSafe, 'validation.title', t('validation.titleToast')));
        return { title: ['Give your recipe a title'] };
      }
      if (payload.visibility === 'group' && !payload.groupId) {
        toast.error(t('validation.groupToast'));
        return { groupId: ['Choose a group for this group recipe'] };
      }
      const res =
        mode === 'edit' && recipeId
          ? await updateRecipeAction(recipeId, payload)
          : await createRecipeAction(payload);
      if (res.ok) {
        draft.clear();
        toast.success(mode === 'edit' ? t('toast.updated') : t('toast.created'));
        router.push(recipeDetailPath(res));
        router.refresh();
        return NO_ERRORS;
      }
      track('editor_save_failed', {
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

  // Live section-completion cues for the in-editor navigator (#112). Derived
  // straight from the working form state so they stay in sync as the user types
  //. No extra state, no interaction with autosave/dictation/paste-import.
  const editorSections: EditorSection[] = [
    {
      id: 'editor-basics',
      label: t('sections.basics'),
      complete: form.title.trim() !== '',
    },
    {
      id: 'editor-ingredients',
      label: t('sections.ingredients'),
      complete: ingredients.some((row) => row.item.trim() !== ''),
    },
    {
      id: 'editor-steps',
      label: t('sections.steps'),
      complete: steps.some((row) => row.instruction.trim() !== ''),
    },
    {
      id: 'editor-details',
      label: t('sections.details'),
      complete:
        form.coverImageUrl.trim() !== '' ||
        form.difficulty !== '' ||
        form.cuisines.trim() !== '' ||
        form.mealTypes.trim() !== '',
    },
    {
      id: 'editor-story',
      label: t('sections.story'),
      complete: form.notes.trim() !== '' || form.story.trim() !== '',
      optional: true,
    },
  ];

  // Live recipe vitals for the floating action bar (rendered at the end of the
  // form). The bar populates as the writer fills the form in and stays visible
  // while scrolling, giving an at-a-glance summary of the recipe's shape.
  // Derived straight from working state. No new sources of truth.
  const filledIngredientCount = ingredients.filter((row) => row.item.trim() !== '').length;
  const filledStepCount = steps.filter((row) => row.instruction.trim() !== '').length;
  const parseMinutes = (value: string): number => {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : 0;
  };
  const totalMinutes =
    parseMinutes(form.prepMinutes) +
    parseMinutes(form.cookMinutes) +
    parseMinutes(form.restMinutes);
  const trimmedServings = form.servings.trim();
  const trimmedServingsNoun = form.servingsNoun.trim();
  const summaryVitals: { key: string; icon: LucideIcon; text: string }[] = [];
  if (filledIngredientCount > 0) {
    summaryVitals.push({
      key: 'ingredients',
      icon: Carrot,
      text: t('vitals.ingredients', { count: filledIngredientCount }),
    });
  }
  if (filledStepCount > 0) {
    summaryVitals.push({
      key: 'steps',
      icon: ListOrdered,
      text: t('vitals.steps', { count: filledStepCount }),
    });
  }
  if (totalMinutes > 0) {
    summaryVitals.push({
      key: 'time',
      icon: Clock,
      text: formatMinutes(totalMinutes),
    });
  }
  if (trimmedServings !== '') {
    summaryVitals.push({
      key: 'servings',
      icon: Users,
      text: `${trimmedServings} ${
        trimmedServingsNoun === '' ? t('vitals.servingsNoun') : trimmedServingsNoun
      }`,
    });
  }
  const difficulty = form.difficulty;
  if (difficulty !== '') {
    summaryVitals.push({
      key: 'difficulty',
      icon: ChefHat,
      text: t(`difficulty.${difficulty}`),
    });
  }
  const trimmedCuisine = commaList(form.cuisines)[0] ?? '';
  if (trimmedCuisine !== '') {
    summaryVitals.push({
      key: 'cuisine',
      icon: Utensils,
      text: trimmedCuisine,
    });
  }
  const trimmedTitle = form.title.trim();
  const barFallbackTitle = mode === 'edit' ? t('editingRecipe') : t('newRecipe');
  const barTitle = trimmedTitle === '' ? barFallbackTitle : trimmedTitle;

  // Move focus to the summary whenever a submit attempt produces errors so
  // screen-reader and keyboard users land on the list of what needs fixing.
  React.useEffect(() => {
    if (Object.keys(errors).length > 0) {
      errorSummaryRef.current?.focus();
    }
  }, [errors]);

  // Distinct ingredient groups in first-appearance order. Drives the per-row
  // "assign to group" picker and whether the ungrouped rows get a labelled band.
  const ingredientGroupChoices = React.useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; name: string }[] = [];
    for (const r of ingredients) {
      if (r.groupId !== '' && !seen.has(r.groupId)) {
        seen.add(r.groupId);
        out.push({ id: r.groupId, name: r.section });
      }
    }
    return out;
  }, [ingredients]);
  const hasIngredientGroups = ingredientGroupChoices.length > 0;
  const hasUngroupedIngredients = ingredients.some((r) => r.groupId === '');

  const stepGroupChoices = React.useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; name: string }[] = [];
    for (const r of steps) {
      if (r.groupId !== '' && !seen.has(r.groupId)) {
        seen.add(r.groupId);
        out.push({ id: r.groupId, name: r.section });
      }
    }
    return out;
  }, [steps]);
  const hasStepGroups = stepGroupChoices.length > 0;
  const hasUngroupedSteps = steps.some((r) => r.groupId === '');
  // Global 1..N step numbers keyed by row, so grouped rendering keeps the same
  // continuous numbering the read side and the ingredient "Used in step" use.
  const stepNumberByKey = React.useMemo(
    () => new Map(steps.map((r, i) => [r.key, i + 1])),
    [steps],
  );

  return (
    <form action={formAction} className="container flex flex-col gap-8 py-8">
      {upgrade !== null ? (
        <UpgradeDialog
          feature="advancedCollaboration"
          open
          onOpenChange={(next) => {
            if (!next) setUpgrade(null);
          }}
          title={t('planLimitTitle')}
          description={upgrade}
        />
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {mode === 'edit' ? t('editRecipe') : t('newRecipe')}
        </h1>
        <ToggleGroup
          aria-label={t('viewAria')}
          value={previewMode ? 'preview' : 'edit'}
          onValueChange={(value) => setPreviewMode(value === 'preview')}
        >
          <ToggleGroupItem value="edit">
            <Pencil className="size-4" /> {t('edit')}
          </ToggleGroupItem>
          <ToggleGroupItem value="preview">
            <Eye className="size-4" /> {t('preview')}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {!previewMode && draft.availableDraft ? (
        <div
          role="region"
          aria-label={t('draft.aria')}
          className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <History className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="font-medium">{t('draft.title')}</p>
              <p className="text-sm text-muted-foreground">{t('draft.body')}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => draft.discardDraft()}>
              {t('draft.discard')}
            </Button>
            <Button
              type="button"
              onClick={() => {
                const pending = draft.availableDraft;
                if (pending) restoreDraft(pending);
              }}
            >
              {t('draft.restore')}
            </Button>
          </div>
        </div>
      ) : null}

      {!previewMode && errorKeys.length > 0 && (
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
              ? t('errorSummary.one')
              : t('errorSummary.many', { count: errorKeys.length })}
          </h2>
          <ul className="mt-2 flex list-disc flex-col gap-1 ps-8">
            {errorKeys.map((key) => {
              const label = LABELLED_FIELDS.has(key) ? t(`fields.${key}`) : prettifyFieldKey(key);
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
                            block: 'center',
                            behavior: 'smooth',
                          });
                          el.focus();
                        }
                      }}
                      className="font-medium text-destructive underline underline-offset-2 hover:no-underline"
                    >
                      {label}
                    </a>
                  ) : (
                    <span className="font-medium text-destructive">{label}</span>
                  )}
                  {message ? <span className="text-muted-foreground">: {message}</span> : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!previewMode && (
        <EditorSectionNav sections={editorSections} topOffset={appHeaderH} onJump={jumpToSection} />
      )}

      {previewMode && (
        <RecipePreview recipe={buildPayload()} mode={mode} fallbackKey={recipeId ?? 'new-recipe'} />
      )}

      {!previewMode && (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          {/* Main column */}
          <div className="flex flex-col gap-8">
            {mode === 'create' ? (
              <ImportRecipePanel
                onImported={applyImported}
                urlLabel={t('importUrl')}
                initialUrl={initialImportUrl}
              />
            ) : null}

            <section id="editor-basics" className="flex scroll-mt-28 flex-col gap-4">
              <Field label={t('fields.title')} name="title" error={errors.title} required>
                <Input
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  placeholder={t('placeholders.title')}
                />
              </Field>
              <Field
                label={t('fields.description')}
                name="description"
                hint={t('hints.description')}
                error={errors.description}
              >
                <Textarea
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  placeholder={t('placeholders.description')}
                  rows={2}
                />
              </Field>
            </section>

            {/* Ingredients */}
            <section id="editor-ingredients" className="flex scroll-mt-28 flex-col gap-3">
              <h2 className="font-display text-xl font-semibold">{t('ingredientsHeading')}</h2>
              <datalist id={unitDatalistId}>
                {unitOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </datalist>
              <div className="flex flex-col gap-4">
                {blocksByGroup(ingredients).map((block) => {
                  const rowList = block.rows.map((row, indexInBlock) => {
                    const hasOptionData = Boolean(
                      row.quantityMax || row.prep || row.note || row.stepPosition || row.optional,
                    );
                    const optionsOpen = hasOptionData || openIngOptions.has(row.key);
                    const rowUnitOptions =
                      foodUnitOptionsByItem.get(row.item.trim().toLowerCase()) ?? null;
                    const rowUnitListId = rowUnitOptions
                      ? `${unitDatalistId}-${row.key}`
                      : unitDatalistId;
                    return (
                      <div
                        key={row.key}
                        className="group flex flex-col gap-2 rounded-lg border border-border bg-surface/60 p-3 sm:p-3.5"
                      >
                        {rowUnitOptions ? (
                          <datalist id={rowUnitListId}>
                            {rowUnitOptions.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </datalist>
                        ) : null}
                        <div className="flex items-start gap-2">
                          <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-[1fr_5rem_6rem]">
                            <RowField label={t('ingredient')} className="col-span-2 sm:col-span-1">
                              <Input
                                value={row.item}
                                onChange={(e) =>
                                  setIngredients((l) =>
                                    l.map((r) =>
                                      r.key === row.key ? { ...r, item: e.target.value } : r,
                                    ),
                                  )
                                }
                                placeholder={t('placeholders.item')}
                              />
                            </RowField>
                            <RowField label={t('quantity')}>
                              <Input
                                value={row.quantity}
                                onChange={(e) => changeIngredientQuantity(row, e.target.value)}
                                placeholder={t('placeholders.quantity')}
                                inputMode="decimal"
                              />
                            </RowField>
                            <RowField label={t('unit')}>
                              <Input
                                value={row.unit}
                                list={rowUnitListId}
                                onChange={(e) => changeIngredientUnit(row, e.target.value)}
                                placeholder={t('placeholders.unit')}
                                autoComplete="off"
                              />
                              {convertHints[row.key] ? (
                                <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                                  <button
                                    type="button"
                                    onClick={() => applyConvertHint(row.key)}
                                    className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-medium text-primary transition-colors hover:bg-primary/20"
                                  >
                                    <Repeat className="size-3" aria-hidden="true" />
                                    {t('convert', {
                                      fromLabel: convertHints[row.key]!.fromLabel,
                                      fromUnit: convertHints[row.key]!.fromUnit,
                                      toLabel: convertHints[row.key]!.toLabel,
                                      toUnit: convertHints[row.key]!.toUnit,
                                    })}
                                  </button>
                                  <CloseButton
                                    size="sm"
                                    onClick={() => clearConvertHint(row.key)}
                                    label={t('dismissConversion')}
                                  />
                                </div>
                              ) : null}
                            </RowField>
                          </div>
                          <RowControls
                            objectLabel={t('ingredientObject')}
                            isFirst={indexInBlock === 0}
                            isLast={indexInBlock === block.rows.length - 1}
                            onUp={() => moveIngredient(row.key, -1)}
                            onDown={() => moveIngredient(row.key, 1)}
                            onRemove={() =>
                              setIngredients((l) =>
                                l.length > 1
                                  ? l.filter((r) => r.key !== row.key)
                                  : [{ ...EMPTY_ING, key: nextKey() }],
                              )
                            }
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <Layers className="size-3.5 shrink-0" />
                            <span className="shrink-0">{t('group')}</span>
                            <NativeSelect
                              wrapperClassName="w-auto min-w-[8rem] max-w-[13rem]"
                              value={row.groupId}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === '__new__') createGroupFromIngredient(row.key);
                                else assignIngredientToGroup(row.key, v);
                              }}
                            >
                              <option value="">{t('noGroup')}</option>
                              {ingredientGroupChoices.map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.name.trim() || t('untitledGroup')}
                                </option>
                              ))}
                              <option value="__new__">{t('newGroup')}</option>
                            </NativeSelect>
                          </label>
                          {!hasOptionData && (
                            <button
                              type="button"
                              aria-expanded={optionsOpen}
                              onClick={() => toggleIngOptions(row.key)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                            >
                              <ChevronDown
                                className={cn(
                                  'size-3.5 transition-transform',
                                  optionsOpen && 'rotate-180',
                                )}
                              />
                              {optionsOpen ? t('fewerOptions') : t('moreOptions')}
                            </button>
                          )}
                        </div>

                        {optionsOpen && (
                          <div className="grid gap-x-3 gap-y-2 border-t border-border/70 pt-3 sm:grid-cols-2">
                            <RowField label={t('maxQuantity')}>
                              <Input
                                value={row.quantityMax}
                                onChange={(e) =>
                                  setIngredients((l) =>
                                    l.map((r) =>
                                      r.key === row.key ? { ...r, quantityMax: e.target.value } : r,
                                    ),
                                  )
                                }
                                placeholder={t('placeholders.quantityMax')}
                                inputMode="decimal"
                              />
                            </RowField>
                            <RowField label={t('prep')}>
                              <Input
                                value={row.prep}
                                onChange={(e) =>
                                  setIngredients((l) =>
                                    l.map((r) =>
                                      r.key === row.key ? { ...r, prep: e.target.value } : r,
                                    ),
                                  )
                                }
                                placeholder={t('placeholders.prep')}
                              />
                            </RowField>
                            <RowField label={t('note')} className="sm:col-span-2">
                              <Input
                                value={row.note}
                                onChange={(e) =>
                                  setIngredients((l) =>
                                    l.map((r) =>
                                      r.key === row.key ? { ...r, note: e.target.value } : r,
                                    ),
                                  )
                                }
                                placeholder={t('placeholders.note')}
                              />
                            </RowField>
                            <RowField label={t('usedInStep')}>
                              <NativeSelect
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
                                <option value="">{t('noSpecificStep')}</option>
                                {steps.map((_, si) => (
                                  <option key={si} value={String(si + 1)}>
                                    {t('step', { position: si + 1 })}
                                  </option>
                                ))}
                              </NativeSelect>
                            </RowField>
                            <label className="flex items-center gap-2 self-end pb-2 text-sm text-muted-foreground">
                              <Checkbox
                                checked={row.optional}
                                onCheckedChange={(value) =>
                                  setIngredients((l) =>
                                    l.map((r) =>
                                      r.key === row.key ? { ...r, optional: value === true } : r,
                                    ),
                                  )
                                }
                              />
                              {t('optionalIngredient')}
                            </label>
                          </div>
                        )}
                      </div>
                    );
                  });

                  if (block.groupId === '') {
                    if (!hasIngredientGroups) {
                      return (
                        <div
                          key={`ungrouped-${block.rows[0]?.key ?? 'empty'}`}
                          className="flex flex-col gap-3"
                        >
                          {rowList}
                        </div>
                      );
                    }
                    return (
                      <div
                        key={`ungrouped-${block.rows[0]?.key ?? 'empty'}`}
                        className="flex flex-col gap-2.5"
                      >
                        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <span>{t('ungrouped')}</span>
                          <span className="text-muted-foreground/60">· {block.rows.length}</span>
                        </div>
                        <div className="flex flex-col gap-3">{rowList}</div>
                        <button
                          type="button"
                          onClick={addIngredient}
                          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <Plus className="size-3.5" /> {t('addIngredient')}
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={block.groupId}
                      className="overflow-hidden rounded-xl border border-primary/25 bg-surface-muted shadow-token-sm"
                    >
                      <div className="flex items-end gap-3 border-b border-border/70 bg-primary/10 p-4 sm:p-5">
                        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                          <Layers className="size-5" />
                        </span>
                        <RowField label={t('groupName')} className="flex-1">
                          <Input
                            id={`ing-group-name-${block.groupId}`}
                            value={block.section}
                            onChange={(e) => renameIngredientGroup(block.groupId, e.target.value)}
                            placeholder={t('placeholders.ingredientGroupName')}
                          />
                        </RowField>
                        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                          {t('itemCount', { count: block.rows.length })}
                        </span>
                        <button
                          type="button"
                          onClick={() => dissolveIngredientGroup(block.groupId)}
                          aria-label={t('removeGroup')}
                          title={t('removeGroup')}
                          className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                      <div className="flex flex-col gap-3 p-4 sm:p-5">
                        <div className="flex flex-col gap-3">{rowList}</div>
                        <button
                          type="button"
                          onClick={() => addIngredientToGroup(block.groupId, block.section)}
                          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
                        >
                          <Plus className="size-3.5" /> {t('addIngredient')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                {!(hasIngredientGroups && hasUngroupedIngredients) && (
                  <Button type="button" size="sm" variant="outline" onClick={addIngredient}>
                    <Plus /> {t('addIngredient')}
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={addIngredientGroup}
                >
                  <Plus /> {t('addGroup')}
                </Button>
              </div>
            </section>

            {/* Steps */}
            <section id="editor-steps" className="flex scroll-mt-28 flex-col gap-3">
              <h2 className="font-display text-xl font-semibold">{t('stepsHeading')}</h2>
              <div className="flex flex-col gap-4">
                {blocksByGroup(steps).map((block) => {
                  const rowList = block.rows.map((row, indexInBlock) => {
                    const hasOptionData = Boolean(
                      row.timerMinutes ||
                      row.techniques ||
                      row.targetTempC ||
                      row.doneness ||
                      row.videoUrl ||
                      row.imageUrl,
                    );
                    const optionsOpen = hasOptionData || openStepOptions.has(row.key);
                    return (
                      <div
                        key={row.key}
                        className="group flex flex-col gap-2 rounded-lg border border-border bg-surface/60 p-3 sm:p-3.5"
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex flex-1 flex-col gap-2">
                            <RowField
                              label={t('step', {
                                position: stepNumberByKey.get(row.key) ?? 0,
                              })}
                            >
                              <Input
                                value={row.title}
                                onChange={(e) =>
                                  setSteps((l) =>
                                    l.map((r) =>
                                      r.key === row.key ? { ...r, title: e.target.value } : r,
                                    ),
                                  )
                                }
                                placeholder={t('placeholders.stepTitle')}
                              />
                            </RowField>
                            <RowField label={t('instruction')}>
                              <Textarea
                                value={row.instruction}
                                onChange={(e) =>
                                  setSteps((l) =>
                                    l.map((r) =>
                                      r.key === row.key ? { ...r, instruction: e.target.value } : r,
                                    ),
                                  )
                                }
                                placeholder={t('placeholders.instruction')}
                                rows={2}
                              />
                            </RowField>
                          </div>
                          <RowControls
                            objectLabel={t('stepObject')}
                            isFirst={indexInBlock === 0}
                            isLast={indexInBlock === block.rows.length - 1}
                            onUp={() => moveStep(row.key, -1)}
                            onDown={() => moveStep(row.key, 1)}
                            onRemove={() =>
                              setSteps((l) =>
                                l.length > 1
                                  ? l.filter((r) => r.key !== row.key)
                                  : [{ ...EMPTY_STEP, key: nextKey() }],
                              )
                            }
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <Layers className="size-3.5 shrink-0" />
                            <span className="shrink-0">{t('section')}</span>
                            <NativeSelect
                              wrapperClassName="w-auto min-w-[8rem] max-w-[13rem]"
                              value={row.groupId}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === '__new__') createGroupFromStep(row.key);
                                else assignStepToGroup(row.key, v);
                              }}
                            >
                              <option value="">{t('noSection')}</option>
                              {stepGroupChoices.map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.name.trim() || t('untitledSection')}
                                </option>
                              ))}
                              <option value="__new__">{t('newSection')}</option>
                            </NativeSelect>
                          </label>
                          {!hasOptionData && (
                            <button
                              type="button"
                              aria-expanded={optionsOpen}
                              onClick={() => toggleStepOptions(row.key)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                            >
                              <ChevronDown
                                className={cn(
                                  'size-3.5 transition-transform',
                                  optionsOpen && 'rotate-180',
                                )}
                              />
                              {optionsOpen ? t('fewerOptions') : t('moreOptions')}
                            </button>
                          )}
                        </div>

                        {optionsOpen && (
                          <div className="grid gap-x-3 gap-y-2 border-t border-border/70 pt-3 sm:grid-cols-2">
                            <RowField label={t('timerMinutes')}>
                              <Input
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
                                placeholder={t('placeholders.timerMinutes')}
                                inputMode="decimal"
                              />
                            </RowField>
                            <RowField label={t('techniques')}>
                              <Input
                                value={row.techniques}
                                onChange={(e) =>
                                  setSteps((l) =>
                                    l.map((r) =>
                                      r.key === row.key ? { ...r, techniques: e.target.value } : r,
                                    ),
                                  )
                                }
                                placeholder={t('placeholders.techniques')}
                              />
                            </RowField>
                            <RowField label={t('targetTemp')}>
                              <Input
                                value={row.targetTempC}
                                onChange={(e) =>
                                  setSteps((l) =>
                                    l.map((r) =>
                                      r.key === row.key ? { ...r, targetTempC: e.target.value } : r,
                                    ),
                                  )
                                }
                                placeholder={t('placeholders.targetTempC')}
                                inputMode="numeric"
                              />
                            </RowField>
                            <RowField label={t('doneness')}>
                              <Input
                                value={row.doneness}
                                onChange={(e) =>
                                  setSteps((l) =>
                                    l.map((r) =>
                                      r.key === row.key ? { ...r, doneness: e.target.value } : r,
                                    ),
                                  )
                                }
                                placeholder={t('placeholders.doneness')}
                              />
                            </RowField>
                            <RowField label={t('videoUrl')} className="sm:col-span-2">
                              <Input
                                type="url"
                                inputMode="url"
                                value={row.videoUrl}
                                onChange={(e) =>
                                  setSteps((l) =>
                                    l.map((r) =>
                                      r.key === row.key ? { ...r, videoUrl: e.target.value } : r,
                                    ),
                                  )
                                }
                                placeholder={t('placeholders.videoUrl')}
                              />
                            </RowField>
                            <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
                              <span className="text-xs font-medium text-muted-foreground">
                                {t('photo')}
                              </span>
                              <ImageUploadField
                                size="compact"
                                value={row.imageUrl}
                                onChange={(url) =>
                                  setSteps((l) =>
                                    l.map((r) => (r.key === row.key ? { ...r, imageUrl: url } : r)),
                                  )
                                }
                                altText={row.imageAlt}
                                onAltTextChange={(alt) =>
                                  setSteps((l) =>
                                    l.map((r) => (r.key === row.key ? { ...r, imageAlt: alt } : r)),
                                  )
                                }
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  });

                  if (block.groupId === '') {
                    if (!hasStepGroups) {
                      return (
                        <div
                          key={`ungrouped-${block.rows[0]?.key ?? 'empty'}`}
                          className="flex flex-col gap-3"
                        >
                          {rowList}
                        </div>
                      );
                    }
                    return (
                      <div
                        key={`ungrouped-${block.rows[0]?.key ?? 'empty'}`}
                        className="flex flex-col gap-2.5"
                      >
                        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <span>{t('ungroupedSteps')}</span>
                          <span className="text-muted-foreground/60">· {block.rows.length}</span>
                        </div>
                        <div className="flex flex-col gap-3">{rowList}</div>
                        <button
                          type="button"
                          onClick={addStep}
                          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <Plus className="size-3.5" /> {t('addStep')}
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={block.groupId}
                      className="overflow-hidden rounded-xl border border-primary/25 bg-surface-muted shadow-token-sm"
                    >
                      <div className="flex items-end gap-3 border-b border-border/70 bg-primary/10 p-4 sm:p-5">
                        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                          <Layers className="size-5" />
                        </span>
                        <RowField label={t('sectionName')} className="flex-1">
                          <Input
                            id={`step-group-name-${block.groupId}`}
                            value={block.section}
                            onChange={(e) => renameStepGroup(block.groupId, e.target.value)}
                            placeholder={t('placeholders.stepSectionName')}
                          />
                        </RowField>
                        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                          {t('stepCount', { count: block.rows.length })}
                        </span>
                        <button
                          type="button"
                          onClick={() => dissolveStepGroup(block.groupId)}
                          aria-label={t('removeSection')}
                          title={t('removeSection')}
                          className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                      <div className="flex flex-col gap-3 p-4 sm:p-5">
                        <div className="flex flex-col gap-3">{rowList}</div>
                        <button
                          type="button"
                          onClick={() => addStepToGroup(block.groupId, block.section)}
                          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
                        >
                          <Plus className="size-3.5" /> {t('addStep')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                {!(hasStepGroups && hasUngroupedSteps) && (
                  <Button type="button" size="sm" variant="outline" onClick={addStep}>
                    <Plus /> {t('addStep')}
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={addStepGroup}
                >
                  <Plus /> {t('addSection')}
                </Button>
              </div>
            </section>

            <section id="editor-story" className="flex scroll-mt-28 flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="font-display text-xl font-semibold">{t('notesStoryHeading')}</h2>
                <p className="text-sm text-muted-foreground">{t('notesStoryDescription')}</p>
              </div>
              <Field
                label={t('fields.notes')}
                name="notes"
                hint={t('hints.notes')}
                error={errors.notes}
              >
                <Textarea
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  rows={3}
                />
              </Field>

              <Field
                label={t('fields.story')}
                name="story"
                hint={t('hints.story')}
                error={errors.story}
              >
                <Textarea
                  value={form.story}
                  onChange={(e) => set('story', e.target.value)}
                  placeholder={t('placeholders.story')}
                  rows={4}
                />
              </Field>
            </section>

            <fieldset className="flex flex-col gap-3 rounded-xl border border-border bg-surface/40 p-4">
              <legend className="px-1 text-sm font-medium text-foreground">
                {t('handedDown.legend')}
              </legend>
              <p className="text-xs text-muted-foreground">{t('handedDown.description')}</p>
              <Field
                label={t('handedDown.name')}
                name="handedDownFrom"
                error={errors.handedDownFrom}
              >
                <Input
                  value={form.handedDownFrom}
                  onChange={(e) => set('handedDownFrom', e.target.value)}
                  placeholder={t('placeholders.handedDownFrom')}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('fields.originYear')} name="originYear" error={errors.originYear}>
                  <Input
                    value={form.originYear}
                    onChange={(e) => set('originYear', e.target.value)}
                    placeholder={t('placeholders.originYear')}
                  />
                </Field>
                <Field
                  label={t('fields.originPlace')}
                  name="originPlace"
                  error={errors.originPlace}
                >
                  <Input
                    value={form.originPlace}
                    onChange={(e) => set('originPlace', e.target.value)}
                    placeholder={t('placeholders.originPlace')}
                  />
                </Field>
              </div>
            </fieldset>
          </div>

          {/* Sidebar */}
          <aside
            id="editor-details"
            style={{ top: appHeaderH + 12 }}
            className="flex h-fit scroll-mt-28 flex-col gap-5 rounded-xl border border-border bg-surface/50 p-5 lg:sticky"
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('fields.servings')} name="servings" error={errors.servings}>
                <Input
                  value={form.servings}
                  onChange={(e) => set('servings', e.target.value)}
                  inputMode="numeric"
                />
              </Field>
              <Field
                label={t('fields.servingsNoun')}
                name="servingsNoun"
                error={errors.servingsNoun}
              >
                <Input
                  value={form.servingsNoun}
                  onChange={(e) => set('servingsNoun', e.target.value)}
                />
              </Field>
              <Field label={t('fields.prepMinutes')} name="prepMinutes" error={errors.prepMinutes}>
                <Input
                  value={form.prepMinutes}
                  onChange={(e) => set('prepMinutes', e.target.value)}
                  inputMode="numeric"
                />
              </Field>
              <Field label={t('fields.cookMinutes')} name="cookMinutes" error={errors.cookMinutes}>
                <Input
                  value={form.cookMinutes}
                  onChange={(e) => set('cookMinutes', e.target.value)}
                  inputMode="numeric"
                />
              </Field>
              <Field
                label={t('fields.restMinutes')}
                name="restMinutes"
                info={t('info.restMinutes')}
                error={errors.restMinutes}
                className="col-span-2"
              >
                <Input
                  value={form.restMinutes}
                  onChange={(e) => set('restMinutes', e.target.value)}
                  inputMode="numeric"
                />
              </Field>
            </div>

            <Field
              label={t('fields.makeAheadNote')}
              name="makeAheadNote"
              info={t('info.makeAhead')}
              error={errors.makeAheadNote}
            >
              <Textarea
                value={form.makeAheadNote}
                onChange={(e) => set('makeAheadNote', e.target.value)}
                placeholder={t('placeholders.makeAhead')}
                rows={2}
              />
            </Field>

            <Field
              label={t('fields.equipment')}
              name="equipment"
              hint={t('hints.equipment')}
              error={errors.equipment}
            >
              <Input
                value={form.equipment}
                onChange={(e) => set('equipment', e.target.value)}
                placeholder={t('placeholders.equipment')}
              />
            </Field>

            <Field label={t('fields.difficulty')} name="difficulty" error={errors.difficulty}>
              <NativeSelect
                value={form.difficulty}
                onChange={(e) => set('difficulty', e.target.value as typeof form.difficulty)}
              >
                <option value="">—</option>
                <option value="easy">{t('difficulty.easy')}</option>
                <option value="medium">{t('difficulty.medium')}</option>
                <option value="hard">{t('difficulty.hard')}</option>
              </NativeSelect>
            </Field>

            <ClassificationField
              label={t('fields.mealTypes')}
              name="mealTypes"
              value={form.mealTypes}
              selected={mealTypeList}
              suggestions={SUGGESTED_TAGS_BY_CATEGORY.meal}
              hint={t('hints.mealTypes')}
              placeholder={t('placeholders.mealTypes')}
              error={errors.mealTypes}
              onChange={(value) => set('mealTypes', value)}
              onToggle={(name) => toggleClassification('mealTypes', mealTypeList, name)}
            />

            <ClassificationField
              label={t('fields.cuisines')}
              name="cuisines"
              value={form.cuisines}
              selected={cuisineList}
              suggestions={SUGGESTED_TAGS_BY_CATEGORY.cuisine}
              hint={t('hints.cuisines')}
              placeholder={t('placeholders.cuisines')}
              error={errors.cuisines}
              onChange={(value) => set('cuisines', value)}
              onToggle={(name) => toggleClassification('cuisines', cuisineList, name)}
              collapsible
              expandLabel={t('moreCuisines')}
              collapseLabel={t('fewerOptions')}
            />

            <div className="h-px bg-border" />

            <fieldset className="flex flex-col gap-3">
              <legend className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                {t('dietaryLegend')}
                <InfoHint label={t('dietaryLegend')}>{t('dietaryHint')}</InfoHint>
              </legend>
              <div className="flex flex-wrap gap-2">
                {dietaryTagsShown.map((tag) => {
                  const checked = form.dietaryFlags.includes(tag);
                  return (
                    <label
                      key={tag}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
                        checked
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border text-muted-foreground hover:bg-muted',
                      )}
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleDietaryFlag(tag)} />
                      {DIETARY_TAG_LABELS[tag]}
                    </label>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setShowMoreDietary((v) => !v)}
                aria-expanded={showMoreDietary}
                className="inline-flex items-center gap-1 self-start text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {showMoreDietary ? (
                  <ChevronUp className="size-3.5" aria-hidden="true" />
                ) : (
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                )}
                {showMoreDietary ? t('fewerOptions') : t('moreDietary')}
              </button>
            </fieldset>

            <div className="h-px bg-border" />

            <fieldset className="flex flex-col gap-3">
              <legend className="text-sm font-medium text-foreground">
                {t('nutritionLegend')}
                <span className="ms-1 font-normal text-muted-foreground">
                  {t('nutritionPerServing')}
                </span>
              </legend>
              <p className="text-xs text-muted-foreground">{t('nutritionHint')}</p>
              <button
                type="button"
                onClick={estimateNutritionFromIngredients}
                className="inline-flex items-center gap-1.5 self-start rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
                {t('estimateFromIngredients')}
              </button>
              <div className="grid grid-cols-2 gap-3">
                {NUTRITION_FIELDS.map((f) => (
                  <Field
                    key={f.key}
                    name={f.key}
                    label={`${t(`nutrition.${f.key}`)} (${f.unit})`}
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

            <ClassificationField
              label={t('fields.tags')}
              name="tags"
              value={form.tags}
              selected={tagList}
              suggestions={SUGGESTED_TAGS_BY_CATEGORY.general}
              hint={t('hints.tags')}
              placeholder={t('placeholders.tags')}
              error={errors.tags}
              onChange={(value) => set('tags', value)}
              onToggle={(name) => toggleClassification('tags', tagList, name)}
            />

            <ImageUploadField
              label={t('fields.coverImageUrl')}
              hint={t('hints.coverImage')}
              value={form.coverImageUrl}
              onChange={(url) => set('coverImageUrl', url)}
              altText={form.coverImageAlt}
              onAltTextChange={(alt) => set('coverImageAlt', alt)}
            />

            <div className="h-px bg-border" />

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">{t('visibilityStatus')}</span>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label={t('visibilityAria', {
                      visibility: t(`visibility.${form.visibility}`),
                      status:
                        form.status === 'published' ? t('status.published') : t('status.draft'),
                    })}
                    className={cn(selectClass, 'flex items-center justify-between gap-2 text-left')}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <VisibilityIcon
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="truncate">{t(`visibility.${form.visibility}`)}</span>
                      <span className="shrink-0 text-muted-foreground">
                        · {form.status === 'published' ? t('status.published') : t('status.draft')}
                      </span>
                    </span>
                    <ChevronDown
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 space-y-4">
                  <Field label={t('fields.visibility')} name="visibility" error={errors.visibility}>
                    <NativeSelect
                      value={form.visibility}
                      onChange={(e) => set('visibility', e.target.value as typeof form.visibility)}
                    >
                      <option value="private">{t('visibility.private')}</option>
                      <option value="group" disabled={groups.length === 0}>
                        {t('visibility.group')}
                      </option>
                      <option value="unlisted">{t('visibility.unlisted')}</option>
                      <option value="public">{t('visibility.public')}</option>
                    </NativeSelect>
                  </Field>

                  {form.visibility === 'group' && groups.length > 0 && (
                    <Field label={t('fields.groupId')} name="groupId" error={errors.groupId}>
                      <NativeSelect
                        value={form.groupId}
                        onChange={(e) => set('groupId', e.target.value)}
                      >
                        <option value="">{t('chooseGroup')}</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                  )}

                  <Field label={t('fields.status')} name="status" error={errors.status}>
                    <NativeSelect
                      value={form.status}
                      onChange={(e) => set('status', e.target.value as typeof form.status)}
                    >
                      <option value="published">{t('status.published')}</option>
                      <option value="draft">{t('status.draft')}</option>
                    </NativeSelect>
                  </Field>
                </PopoverContent>
              </Popover>
            </div>
          </aside>
        </div>
      )}

      {/* Floating action bar (round 10): Save/Cancel float on a rounded,
          shadowed, blurred pill pinned to the bottom of the viewport at every
          breakpoint, so they stay within reach on this long form without
          scrolling back to the top. It's the last flow child with
          `sticky bottom-0`, so it rides the viewport bottom while scrolling and
          settles beneath the content at the end. The transparent gutter is
          click-through (pointer-events-none) with an interactive inner bar. Bottom padding respects the home-indicator safe area. The BottomNav is
          suppressed on editor routes so this bar owns the bottom edge (#294). */}
      <div className="pointer-events-none sticky bottom-0 z-30 -mx-4 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <div className="pointer-events-auto mx-auto flex max-w-3xl flex-col gap-2 rounded-2xl border border-border bg-background/85 px-4 py-2 shadow-token-lg backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span
              className={cn(
                'truncate text-sm font-semibold leading-tight',
                trimmedTitle === '' ? 'text-muted-foreground' : 'text-foreground',
              )}
            >
              {barTitle}
            </span>
            {summaryVitals.length > 0 && (
              <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground">
                {summaryVitals.map((vital) => {
                  const Icon = vital.icon;
                  return (
                    <span key={vital.key} className="inline-flex items-center gap-1 tabular-nums">
                      <Icon
                        className="size-3.5 shrink-0 text-muted-foreground/70"
                        aria-hidden="true"
                      />
                      {vital.text}
                    </span>
                  );
                })}
              </span>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              variant="ghost"
              className="flex-1 sm:flex-none"
              onClick={() => router.back()}
            >
              {t('cancel')}
            </Button>
            <Button type="submit" className="flex-1 sm:flex-none" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Save />}
              {mode === 'edit' ? t('saveChanges') : t('saveRecipe')}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

function RowControls({
  onUp,
  onDown,
  onRemove,
  objectLabel,
  isFirst,
  isLast,
}: {
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  objectLabel: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const t = useTranslations('recipeEditor');
  return (
    <div className="flex shrink-0 items-center">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-8 text-muted-foreground disabled:opacity-30"
        disabled={isFirst}
        aria-label={t('moveUpNamed', { object: objectLabel })}
        onClick={onUp}
      >
        <ChevronUp />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-8 text-muted-foreground disabled:opacity-30"
        disabled={isLast}
        aria-label={t('moveDownNamed', { object: objectLabel })}
        onClick={onDown}
      >
        <ChevronDown />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={t('removeNamed', { object: objectLabel })}
        className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        onClick={onRemove}
      >
        <Trash2 />
      </Button>
    </div>
  );
}

/**
 * Field keys that carry a hand-written label under `recipeEditor.fields` in the
 * catalogs. Anything outside this set falls back to {@link prettifyFieldKey}.
 */
const LABELLED_FIELDS = new Set([
  'title',
  'description',
  'servings',
  'servingsNoun',
  'prepMinutes',
  'cookMinutes',
  'restMinutes',
  'makeAheadNote',
  'equipment',
  'difficulty',
  'mealTypes',
  'cuisines',
  'notes',
  'story',
  'handedDownFrom',
  'originYear',
  'originPlace',
  'calories',
  'proteinGrams',
  'carbsGrams',
  'fatGrams',
  'saturatedFatGrams',
  'sodiumMg',
  'sugarGrams',
  'fiberGrams',
  'tags',
  'visibility',
  'groupId',
  'status',
  'ingredients',
  'steps',
  'dietaryFlags',
  'coverImageUrl',
]);

// Fields that render a control with a matching `recipe-field-<key>` id, so the
// error-summary entry can be an anchor that focuses the offending control.
const ANCHORABLE_FIELDS = new Set([
  'title',
  'description',
  'servings',
  'servingsNoun',
  'prepMinutes',
  'cookMinutes',
  'difficulty',
  'mealTypes',
  'cuisines',
  'notes',
  'story',
  'handedDownFrom',
  'originYear',
  'originPlace',
  'calories',
  'proteinGrams',
  'carbsGrams',
  'fatGrams',
  'saturatedFatGrams',
  'sodiumMg',
  'sugarGrams',
  'fiberGrams',
  'tags',
  'visibility',
  'groupId',
  'status',
]);

function prettifyFieldKey(key: string) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function ClassificationField({
  label,
  name,
  value,
  selected,
  suggestions,
  hint,
  placeholder,
  error,
  onChange,
  onToggle,
  collapsible = false,
  expandLabel,
  collapseLabel,
}: {
  label: string;
  name: 'mealTypes' | 'cuisines' | 'tags';
  value: string;
  selected: string[];
  suggestions: CanonicalTag[];
  hint?: string;
  placeholder: string;
  error?: string[];
  onChange: (value: string) => void;
  onToggle: (name: string) => void;
  collapsible?: boolean;
  expandLabel?: string;
  collapseLabel?: string;
}) {
  const tNames = useTranslations('classificationNames');
  const [expanded, setExpanded] = React.useState(false);
  const visibleSuggestions = collapsible && !expanded ? suggestions.slice(0, 16) : suggestions;
  return (
    <div className="flex flex-col gap-2">
      <Field label={label} name={name} hint={hint} error={error}>
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {visibleSuggestions.map((suggestion) => {
          const active = selected.some(
            (item) => item.toLowerCase() === suggestion.name.toLowerCase(),
          );
          return (
            <button
              key={suggestion.slug}
              type="button"
              onClick={() => onToggle(suggestion.name)}
              aria-pressed={active}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                active
                  ? 'bg-primary/12 border-primary/30 text-[color:var(--badge-ink-primary)]'
                  : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {tNames.has(suggestion.slug) ? tNames(suggestion.slug) : suggestion.name}
            </button>
          );
        })}
      </div>
      {collapsible && suggestions.length > 16 && expandLabel && collapseLabel && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1 self-start text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {expanded ? (
            <ChevronUp className="size-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-3.5" aria-hidden="true" />
          )}
          {expanded ? collapseLabel : expandLabel}
        </button>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  info,
  error,
  required,
  name,
  className,
  children,
}: {
  label: string;
  hint?: string;
  info?: React.ReactNode;
  error?: string[];
  required?: boolean;
  name?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const reactId = React.useId();
  const child = React.isValidElement(children)
    ? (children as React.ReactElement<Record<string, unknown>>)
    : null;
  const existingId = child && typeof child.props.id === 'string' ? child.props.id : undefined;
  // Named fields get a deterministic id so the error summary can link to them.
  const controlId = existingId ?? (name ? `recipe-field-${name}` : reactId);
  const hasError = Boolean(error?.length);
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const describedBy = hasError ? errorId : hint ? hintId : undefined;
  const existingDescribedBy =
    child && typeof child.props['aria-describedby'] === 'string'
      ? child.props['aria-describedby']
      : undefined;

  // Thread the generated id + validation state onto the control so the label
  // association, required state, and error message are all programmatic.
  const control = child
    ? React.cloneElement(child, {
        id: controlId,
        'aria-required': required ? true : undefined,
        'aria-invalid': hasError ? true : undefined,
        'aria-describedby':
          [existingDescribedBy, describedBy].filter(Boolean).join(' ') || undefined,
      })
    : children;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center gap-1.5">
        <Label htmlFor={controlId} className="flex items-center gap-1">
          {label}
          {required && (
            <span className="text-destructive" aria-hidden="true">
              *
            </span>
          )}
        </Label>
        {info && <InfoHint label={label}>{info}</InfoHint>}
      </div>
      {control}
      {hint && !hasError && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {hasError ? (
        <p id={errorId} className={cn('text-xs text-destructive')}>
          {error![0]}
        </p>
      ) : null}
    </div>
  );
}
