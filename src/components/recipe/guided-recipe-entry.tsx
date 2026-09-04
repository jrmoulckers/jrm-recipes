'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { AlertCircle, Check, History, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { useThemeBehavior } from '~/components/theme/theme-provider';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import { useConfirm } from '~/components/ui/confirm-dialog-context';
import { friendlyError } from '~/lib/error-copy';
import {
  emptyGuidedRecipeDraft,
  GUIDED_RECIPE_STEP_COUNT,
  type GuidedRecipeDraft,
  toGuidedRecipeInput,
} from '~/lib/guided-recipe';
import { recipeDetailPath } from '~/lib/recipe-path';
import { type DraftIssue, useAutosaveDraft } from '~/lib/use-autosave-draft';
import { createRecipeAction } from '~/server/recipes/actions';

const RecipePreview = dynamic(
  () => import('~/components/recipe/recipe-preview').then((module) => module.RecipePreview),
  { ssr: false },
);

const UpgradeDialog = dynamic(() =>
  import('~/components/billing/upgrade-dialog').then((module) => module.UpgradeDialog),
);

const STEP_KEYS = ['title', 'ingredients', 'steps', 'story', 'review'] as const;
type GuidedStepKey = (typeof STEP_KEYS)[number];

type StepErrors = {
  title?: string;
  ingredients?: string;
  steps?: string;
  save?: string;
};

function replaceRow(rows: string[], index: number, value: string): string[] {
  return rows.map((row, rowIndex) => (rowIndex === index ? value : row));
}

function removeRow(rows: string[], index: number): string[] {
  const next = rows.filter((_, rowIndex) => rowIndex !== index);
  return next.length > 0 ? next : [''];
}

export function GuidedRecipeEntry({ draftOwnerId }: { draftOwnerId?: string }) {
  const t = useTranslations('guidedRecipe');
  const router = useRouter();
  const confirm = useConfirm();
  const { largeTargets } = useThemeBehavior();
  const [draftValue, setDraftValue] = React.useState<GuidedRecipeDraft>(emptyGuidedRecipeDraft);
  const [initialJson] = React.useState(() => JSON.stringify(emptyGuidedRecipeDraft()));
  const [errors, setErrors] = React.useState<StepErrors>({});
  const [upgrade, setUpgrade] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const titleRef = React.useRef<HTMLInputElement>(null);
  const firstIngredientRef = React.useRef<HTMLInputElement>(null);
  const firstStepRef = React.useRef<HTMLTextAreaElement>(null);
  const saveErrorRef = React.useRef<HTMLParagraphElement>(null);
  const initialStepRef = React.useRef(true);
  const newIngredientRef = React.useRef<HTMLInputElement>(null);
  const newStepRef = React.useRef<HTMLTextAreaElement>(null);
  const draftDirty = JSON.stringify(draftValue) !== initialJson;
  const stepKey = STEP_KEYS[draftValue.currentStep] ?? 'title';
  const recipeInput = React.useMemo(() => toGuidedRecipeInput(draftValue), [draftValue]);

  const onDraftIssue = React.useCallback(
    (issue: DraftIssue) => {
      if (issue === 'storage-unavailable') {
        toast.error(t('draft.storageUnavailable'));
      } else if (issue === 'cross-tab-conflict') {
        toast.info(t('draft.changedElsewhere'));
      } else {
        toast.info(issue === 'expired' ? t('draft.expired') : t('draft.invalid'));
      }
    },
    [t],
  );

  const draft = useAutosaveDraft<GuidedRecipeDraft>({
    context: draftOwnerId ? { userId: draftOwnerId, mode: 'guided-create' } : null,
    snapshot: draftValue,
    dirty: draftDirty,
    onIssue: onDraftIssue,
  });

  React.useEffect(() => {
    if (initialStepRef.current) {
      initialStepRef.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [draftValue.currentStep]);

  function setField<K extends keyof GuidedRecipeDraft>(field: K, value: GuidedRecipeDraft[K]) {
    setDraftValue((current) => ({ ...current, [field]: value }));
  }

  function validateStep(step: GuidedStepKey): boolean {
    if (step === 'title' && draftValue.title.trim() === '') {
      setErrors({ title: t('validation.title') });
      requestAnimationFrame(() => titleRef.current?.focus());
      return false;
    }
    if (step === 'ingredients' && !draftValue.ingredients.some((item) => item.trim() !== '')) {
      setErrors({ ingredients: t('validation.ingredients') });
      requestAnimationFrame(() => firstIngredientRef.current?.focus());
      return false;
    }
    if (step === 'steps' && !draftValue.steps.some((instruction) => instruction.trim() !== '')) {
      setErrors({ steps: t('validation.steps') });
      requestAnimationFrame(() => firstStepRef.current?.focus());
      return false;
    }
    setErrors({});
    return true;
  }

  function nextStep() {
    if (!validateStep(stepKey)) return;
    setDraftValue((current) => ({
      ...current,
      currentStep: Math.min(current.currentStep + 1, GUIDED_RECIPE_STEP_COUNT - 1),
    }));
  }

  function previousStep() {
    setErrors({});
    setDraftValue((current) => ({
      ...current,
      currentStep: Math.max(current.currentStep - 1, 0),
    }));
  }

  async function leaveFlow() {
    if (draftDirty) {
      const leave = await confirm({
        title: t('leave.title'),
        description: t('leave.description'),
        confirmLabel: t('leave.confirm'),
        cancelLabel: t('leave.cancel'),
        destructive: false,
      });
      if (!leave) return;
    }
    await draft.flush();
    draft.allowNavigation();
    router.push('/recipes');
  }

  function addIngredient() {
    setField('ingredients', [...draftValue.ingredients, '']);
    requestAnimationFrame(() => newIngredientRef.current?.focus());
  }

  function addStep() {
    setField('steps', [...draftValue.steps, '']);
    requestAnimationFrame(() => newStepRef.current?.focus());
  }

  function removeIngredient(index: number) {
    const next = removeRow(draftValue.ingredients, index);
    setField('ingredients', next);
    requestAnimationFrame(() => {
      const targetIndex = Math.min(index, next.length - 1);
      document.getElementById(`guided-ingredient-${targetIndex}`)?.focus();
    });
  }

  function removeStep(index: number) {
    const next = removeRow(draftValue.steps, index);
    setField('steps', next);
    requestAnimationFrame(() => {
      const targetIndex = Math.min(index, next.length - 1);
      document.getElementById(`guided-instruction-${targetIndex}`)?.focus();
    });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || draftValue.currentStep !== GUIDED_RECIPE_STEP_COUNT - 1) return;
    if (!validateStep('title') || !validateStep('ingredients') || !validateStep('steps')) return;

    startTransition(async () => {
      const result = await createRecipeAction(recipeInput);
      if (result.ok) {
        draft.allowNavigation();
        draft.clear();
        toast.success(t('toast.created'));
        router.push(recipeDetailPath(result));
        router.refresh();
        return;
      }

      if (result.upgrade) {
        setUpgrade(result.error);
      } else {
        const fieldMessage = Object.values(result.fieldErrors ?? {}).flat()[0];
        setErrors({ save: fieldMessage ?? result.error });
        toast.error(friendlyError(result.error));
        requestAnimationFrame(() => saveErrorRef.current?.focus());
      }
    });
  }

  const controlClass = 'min-h-14 text-lg';
  const actionSize = largeTargets ? 'xl' : 'lg';

  return (
    <form onSubmit={submit} className="container flex max-w-4xl flex-col gap-6 py-8">
      {upgrade !== null ? (
        <UpgradeDialog
          open
          onOpenChange={(open) => {
            if (!open) setUpgrade(null);
          }}
          title={t('planLimitTitle')}
          description={upgrade}
        />
      ) : null}

      <header>
        <p className="text-sm font-semibold text-primary">{t('eyebrow')}</p>
        <h1 className="font-display text-3xl font-bold tracking-tight">{t('heading')}</h1>
        <p className="mt-2 text-muted-foreground">{t('description')}</p>
      </header>

      <nav aria-label={t('progress.aria')}>
        <p className="mb-2 text-sm font-medium">
          {t('progress.position', {
            current: draftValue.currentStep + 1,
            total: GUIDED_RECIPE_STEP_COUNT,
          })}
        </p>
        <ol className="grid grid-cols-5 gap-2">
          {STEP_KEYS.map((key, index) => {
            const complete = index < draftValue.currentStep;
            const current = index === draftValue.currentStep;
            return (
              <li
                key={key}
                aria-current={current ? 'step' : undefined}
                className="flex min-w-0 flex-col items-center gap-1 text-center text-xs"
              >
                <span
                  className={[
                    'flex size-9 items-center justify-center rounded-full border font-semibold',
                    current
                      ? 'border-primary bg-primary text-primary-foreground'
                      : complete
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground',
                  ].join(' ')}
                >
                  {complete ? (
                    <>
                      <Check aria-hidden="true" className="size-4" />
                      <span className="sr-only">{t('progress.complete')}</span>
                    </>
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="hidden truncate sm:block">{t(`steps.${key}.short`)}</span>
              </li>
            );
          })}
        </ol>
      </nav>

      {draft.availableDraft ? (
        <section
          aria-label={t('draft.aria')}
          className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <History className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="font-medium">{t('draft.title')}</p>
              <p className="text-sm text-muted-foreground">{t('draft.description')}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                draft.discardDraft();
                requestAnimationFrame(() => headingRef.current?.focus());
              }}
            >
              {t('draft.discard')}
            </Button>
            <Button
              type="button"
              onClick={() => {
                const available = draft.availableDraft;
                if (!available) return;
                setDraftValue(available);
                draft.acceptDraft();
                toast.success(t('draft.restored'));
                requestAnimationFrame(() => headingRef.current?.focus());
              }}
            >
              {t('draft.restore')}
            </Button>
          </div>
        </section>
      ) : null}

      <section
        aria-labelledby={`guided-step-${stepKey}`}
        className="flex min-h-[20rem] flex-col gap-5 rounded-2xl border border-border bg-card p-5 shadow-token-sm sm:p-8"
      >
        <div>
          <h2
            ref={headingRef}
            id={`guided-step-${stepKey}`}
            tabIndex={-1}
            className="font-display text-2xl font-bold outline-none"
          >
            {t(`steps.${stepKey}.title`)}
          </h2>
          <p id={`guided-step-${stepKey}-description`} className="mt-1 text-muted-foreground">
            {t(`steps.${stepKey}.description`)}
          </p>
        </div>

        {stepKey === 'title' ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="guided-title" className="text-base">
              {t('fields.title')}
            </Label>
            <Input
              ref={titleRef}
              id="guided-title"
              value={draftValue.title}
              onChange={(event) => {
                setField('title', event.target.value);
                if (errors.title) setErrors({});
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  nextStep();
                }
              }}
              placeholder={t('placeholders.title')}
              maxLength={200}
              aria-required
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? 'guided-title-error' : 'guided-title-hint'}
              className={controlClass}
            />
            <p id="guided-title-hint" className="text-sm text-muted-foreground">
              {t('hints.title')}
            </p>
            {errors.title ? (
              <p
                id="guided-title-error"
                role="alert"
                className="flex items-center gap-2 text-sm font-medium text-foreground"
              >
                <AlertCircle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
                {errors.title}
              </p>
            ) : null}
          </div>
        ) : null}

        {stepKey === 'ingredients' ? (
          <div className="flex flex-col gap-4">
            <p id="guided-ingredients-hint" className="text-sm font-medium text-foreground">
              {t('hints.ingredientsRequired')}
            </p>
            {draftValue.ingredients.map((ingredient, index) => (
              <div key={`ingredient-${index}`} className="flex items-end gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Label htmlFor={`guided-ingredient-${index}`} className="text-base">
                    {t('fields.ingredient', { position: index + 1 })}
                  </Label>
                  <Input
                    ref={(element) => {
                      if (index === 0) firstIngredientRef.current = element;
                      if (index === draftValue.ingredients.length - 1) {
                        newIngredientRef.current = element;
                      }
                    }}
                    id={`guided-ingredient-${index}`}
                    value={ingredient}
                    onChange={(event) => {
                      setField(
                        'ingredients',
                        replaceRow(draftValue.ingredients, index, event.target.value),
                      );
                      if (errors.ingredients) setErrors({});
                    }}
                    placeholder={t('placeholders.ingredient')}
                    maxLength={300}
                    aria-invalid={Boolean(errors.ingredients) && index === 0}
                    aria-describedby={
                      errors.ingredients && index === 0
                        ? 'guided-ingredients-hint guided-ingredients-error'
                        : 'guided-ingredients-hint'
                    }
                    className={controlClass}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeIngredient(index)}
                  aria-label={t('actions.removeIngredient', { position: index + 1 })}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            ))}
            {errors.ingredients ? (
              <p
                id="guided-ingredients-error"
                role="alert"
                className="flex items-center gap-2 text-sm font-medium text-foreground"
              >
                <AlertCircle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
                {errors.ingredients}
              </p>
            ) : null}
            <Button type="button" variant="outline" size={actionSize} onClick={addIngredient}>
              <Plus aria-hidden="true" />
              {t('actions.addIngredient')}
            </Button>
          </div>
        ) : null}

        {stepKey === 'steps' ? (
          <div className="flex flex-col gap-4">
            <p id="guided-steps-hint" className="text-sm font-medium text-foreground">
              {t('hints.stepsRequired')}
            </p>
            {draftValue.steps.map((instruction, index) => (
              <div key={`step-${index}`} className="flex items-end gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Label htmlFor={`guided-instruction-${index}`} className="text-base">
                    {t('fields.instruction', { position: index + 1 })}
                  </Label>
                  <Textarea
                    ref={(element) => {
                      if (index === 0) firstStepRef.current = element;
                      if (index === draftValue.steps.length - 1) newStepRef.current = element;
                    }}
                    id={`guided-instruction-${index}`}
                    value={instruction}
                    onChange={(event) => {
                      setField('steps', replaceRow(draftValue.steps, index, event.target.value));
                      if (errors.steps) setErrors({});
                    }}
                    placeholder={t('placeholders.instruction')}
                    maxLength={5000}
                    rows={4}
                    aria-invalid={Boolean(errors.steps) && index === 0}
                    aria-describedby={
                      errors.steps && index === 0
                        ? 'guided-steps-hint guided-steps-error'
                        : 'guided-steps-hint'
                    }
                    className="min-h-32 text-lg"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeStep(index)}
                  aria-label={t('actions.removeStep', { position: index + 1 })}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            ))}
            {errors.steps ? (
              <p
                id="guided-steps-error"
                role="alert"
                className="flex items-center gap-2 text-sm font-medium text-foreground"
              >
                <AlertCircle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
                {errors.steps}
              </p>
            ) : null}
            <Button type="button" variant="outline" size={actionSize} onClick={addStep}>
              <Plus aria-hidden="true" />
              {t('actions.addStep')}
            </Button>
          </div>
        ) : null}

        {stepKey === 'story' ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="guided-source" className="text-base">
                {t('fields.handedDownFrom')}
              </Label>
              <Input
                id="guided-source"
                value={draftValue.handedDownFrom}
                onChange={(event) => setField('handedDownFrom', event.target.value)}
                placeholder={t('placeholders.handedDownFrom')}
                maxLength={200}
                className={controlClass}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="guided-story" className="text-base">
                {t('fields.story')}
              </Label>
              <Textarea
                id="guided-story"
                value={draftValue.story}
                onChange={(event) => setField('story', event.target.value)}
                placeholder={t('placeholders.story')}
                maxLength={4000}
                rows={6}
                className="min-h-40 text-lg"
              />
            </div>
          </div>
        ) : null}

        {stepKey === 'review' ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-border bg-surface/50 p-4">
              <p className="font-medium">{t('review.privateTitle')}</p>
              <p className="text-sm text-muted-foreground">{t('review.privateDescription')}</p>
            </div>
            {errors.save ? (
              <p
                ref={saveErrorRef}
                role="alert"
                tabIndex={-1}
                className="flex items-center gap-2 rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm font-medium text-foreground outline-none"
              >
                <AlertCircle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
                {errors.save}
              </p>
            ) : null}
            <RecipePreview recipe={recipeInput} mode="create" fallbackKey="guided-recipe" />
          </div>
        ) : null}
      </section>

      <div className="sticky bottom-0 z-20 -mx-4 bg-background/90 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {draftValue.currentStep === 0 ? (
            <Button type="button" variant="ghost" size={actionSize} onClick={leaveFlow}>
              {t('actions.cancel')}
            </Button>
          ) : (
            <Button type="button" variant="outline" size={actionSize} onClick={previousStep}>
              {t('actions.back')}
            </Button>
          )}
          {draftValue.currentStep < GUIDED_RECIPE_STEP_COUNT - 1 ? (
            <Button type="button" size={actionSize} onClick={nextStep}>
              {t('actions.next')}
            </Button>
          ) : (
            <Button type="submit" size={actionSize} loading={pending}>
              {t('actions.save')}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
