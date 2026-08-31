import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { RecipeEditor, type RecipeEditorValue } from './recipe-editor';
import { ConfirmProvider } from '~/components/ui/confirm-dialog';
import { serializeDraft } from '~/lib/draft-storage';
import { draftStorageKey } from '~/lib/use-autosave-draft';
import { createRecipeAction } from '~/server/recipes/actions';
import { IntlWrapper } from '~/test/intl';

const back = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back, push, refresh }),
}));

vi.mock('~/server/recipes/actions', () => ({
  createRecipeAction: vi.fn(),
  importRecipeFromUrlAction: vi.fn(),
  updateRecipeAction: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const mockedCreate = vi.mocked(createRecipeAction);
const context = { userId: 'user-1', mode: 'create' } as const;
const storageKey = draftStorageKey(context);

function draftValue(title: string): RecipeEditorValue {
  return {
    title,
    description: '',
    coverImageUrl: '',
    coverImageAlt: '',
    servings: '4',
    servingsNoun: 'servings',
    prepMinutes: '',
    cookMinutes: '',
    restMinutes: '',
    makeAheadNote: '',
    equipment: '',
    calories: '',
    proteinGrams: '',
    carbsGrams: '',
    fatGrams: '',
    saturatedFatGrams: '',
    sodiumMg: '',
    sugarGrams: '',
    fiberGrams: '',
    difficulty: '',
    cuisines: '',
    mealTypes: '',
    sourceName: '',
    sourceUrl: '',
    notes: '',
    story: '',
    handedDownFrom: '',
    originYear: '',
    originPlace: '',
    visibility: 'private',
    status: 'published',
    groupId: '',
    tags: '',
    dietaryFlags: [],
    ingredients: [],
    steps: [],
  };
}

function renderEditor() {
  return render(
    <IntlWrapper>
      <ConfirmProvider>
        <RecipeEditor mode="create" draftOwnerId={context.userId} />
      </ConfirmProvider>
    </IntlWrapper>,
  );
}

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
});

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('RecipeEditor draft recovery and exit guard (#115)', () => {
  it('leaves immediately when pristine', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(back).toHaveBeenCalledOnce();
  });

  it('keeps keyboard focus in an accessible confirmation before leaving dirty work', async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.type(screen.getByLabelText(/^Title/), 'Pie');

    const cancel = screen.getByRole('button', { name: 'Cancel' });
    await user.click(cancel);

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(back).not.toHaveBeenCalled();
    expect(cancel).toHaveFocus();

    await user.click(cancel);
    await user.click(screen.getByRole('button', { name: 'Leave editor' }));
    expect(back).toHaveBeenCalledOnce();
  });

  it('offers a local draft without replacing server-loaded form state', async () => {
    window.localStorage.setItem(storageKey, serializeDraft(draftValue('Recovered pie')));
    renderEditor();

    expect(await screen.findByRole('region', { name: 'Unfinished recipe' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Title/)).toHaveValue('');

    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(screen.getByLabelText(/^Title/)).toHaveValue('Recovered pie');
  });

  it('discards only the current scoped draft', async () => {
    const otherKey = draftStorageKey({
      userId: context.userId,
      mode: 'edit',
      recipeId: 'recipe-2',
    });
    window.localStorage.setItem(storageKey, serializeDraft(draftValue('Create draft')));
    window.localStorage.setItem(otherKey, serializeDraft(draftValue('Edit draft')));
    renderEditor();

    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }));

    expect(window.localStorage.getItem(storageKey)).toBeNull();
    expect(window.localStorage.getItem(otherKey)).not.toBeNull();
  });

  it('clears the scoped draft and suppresses navigation protection after a successful save', async () => {
    const user = userEvent.setup();
    mockedCreate.mockResolvedValue({
      ok: true,
      id: 'recipe-1',
      slug: 'pie',
      cook: 'ada',
    });
    renderEditor();
    await user.type(screen.getByLabelText(/^Title/), 'Pie');
    window.localStorage.setItem(storageKey, serializeDraft(draftValue('Pie')));

    await user.click(screen.getByRole('button', { name: 'Save recipe' }));

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledOnce());
    expect(window.localStorage.getItem(storageKey)).toBeNull();
    expect(push).toHaveBeenCalledWith('/recipes/ada/pie');

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('retains the draft after a failed submission', async () => {
    const user = userEvent.setup();
    mockedCreate.mockResolvedValue({ ok: false, error: 'Save failed' });
    renderEditor();
    await user.type(screen.getByLabelText(/^Title/), 'Pie');
    const stored = serializeDraft(draftValue('Pie'));
    window.localStorage.setItem(storageKey, stored);

    await user.click(screen.getByRole('button', { name: 'Save recipe' }));

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledOnce());
    expect(window.localStorage.getItem(storageKey)).toBe(stored);
    expect(push).not.toHaveBeenCalled();
  });
});
