import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmProvider } from '~/components/ui/confirm-dialog';
import { serializeDraft } from '~/lib/draft-storage';
import { emptyGuidedRecipeDraft } from '~/lib/guided-recipe';
import { draftStorageKey } from '~/lib/use-autosave-draft';
import { IntlWrapper } from '~/test/intl';
import { createRecipeAction } from '~/server/recipes/actions';
import { GuidedRecipeEntry } from './guided-recipe-entry';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock('~/server/recipes/actions', () => ({
  createRecipeAction: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('~/components/recipe/recipe-preview', () => ({
  RecipePreview: ({ recipe }: { recipe: { title: string } }) => (
    <div data-testid="recipe-preview">{recipe.title}</div>
  ),
}));

const mockedCreate = vi.mocked(createRecipeAction);

function renderGuided(props: React.ComponentProps<typeof GuidedRecipeEntry> = {}) {
  return render(
    <IntlWrapper>
      <ConfirmProvider>
        <GuidedRecipeEntry {...props} />
      </ConfirmProvider>
    </IntlWrapper>,
  );
}

async function reachReview(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Recipe name'), 'Sunday sauce');
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.type(screen.getByLabelText('Ingredient 1'), '2 cans tomatoes');
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.type(screen.getByLabelText('Step 1'), 'Simmer slowly.');
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.type(screen.getByLabelText('Who shared this recipe?'), 'Grandma Rosa');
  await user.type(screen.getByLabelText("What's the story behind it?"), 'Sunday dinner.');
  await user.click(screen.getByRole('button', { name: 'Next' }));
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('GuidedRecipeEntry (#398)', () => {
  it('guards each required step and associates the error with its input', async () => {
    const user = userEvent.setup();
    renderGuided();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    const title = screen.getByLabelText('Recipe name');
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(title).toHaveAttribute('aria-describedby', 'guided-title-error');
    expect(screen.getByRole('alert')).toHaveTextContent(/name before continuing/i);
  });

  it('moves forward and back without losing entered values', async () => {
    const user = userEvent.setup();
    renderGuided();

    await user.type(screen.getByLabelText('Recipe name'), 'Pie');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.type(screen.getByLabelText('Ingredient 1'), 'Apples');
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByLabelText('Recipe name')).toHaveValue('Pie');
  });

  it('adds repeatable ingredient and instruction fields', async () => {
    const user = userEvent.setup();
    renderGuided();

    await user.type(screen.getByLabelText('Recipe name'), 'Pie');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Add another ingredient' }));
    expect(screen.getByLabelText('Ingredient 2')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Ingredient 1'), 'Apples');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Add another step' }));
    expect(screen.getByLabelText('Step 2')).toBeInTheDocument();
  });

  it('reviews and creates through the existing recipe action', async () => {
    const user = userEvent.setup();
    mockedCreate.mockResolvedValue({
      ok: true,
      id: 'recipe-1',
      slug: 'sunday-sauce',
      cook: 'rosa',
    });
    renderGuided();
    await reachReview(user);

    expect(await screen.findByTestId('recipe-preview')).toHaveTextContent('Sunday sauce');
    expect(screen.getByText('Only you can see this recipe')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save recipe' }));

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledOnce());
    expect(mockedCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Sunday sauce',
        visibility: 'private',
        status: 'published',
        handedDownFrom: 'Grandma Rosa',
        story: 'Sunday dinner.',
        ingredients: [{ item: '2 cans tomatoes', optional: false }],
        steps: [{ instruction: 'Simmer slowly.', techniques: [] }],
      }),
    );
    expect(push).toHaveBeenCalledWith('/recipes/rosa/sunday-sauce');
  });

  it('retains the review and announces a failed save', async () => {
    const user = userEvent.setup();
    mockedCreate.mockResolvedValue({ ok: false, error: 'Save failed' });
    renderGuided();
    await reachReview(user);

    await user.click(screen.getByRole('button', { name: 'Save recipe' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Save failed');
    expect(
      screen.getByRole('heading', { name: /does everything look right/i }),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('offers and restores only the isolated guided draft', async () => {
    const guidedKey = draftStorageKey({ userId: 'user-1', mode: 'guided-create' });
    const fullEditorKey = draftStorageKey({ userId: 'user-1', mode: 'create' });
    window.localStorage.setItem(
      guidedKey,
      serializeDraft({ ...emptyGuidedRecipeDraft(), title: 'Recovered pie' }),
    );
    window.localStorage.setItem(fullEditorKey, serializeDraft({ title: 'Full editor pie' }));
    renderGuided({ draftOwnerId: 'user-1' });

    expect(
      await screen.findByRole('region', { name: 'Unfinished step-by-step recipe' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByLabelText('Recipe name')).toHaveValue('Recovered pie');
    expect(window.localStorage.getItem(fullEditorKey)).not.toBeNull();
  });

  it('flushes the latest guided edit before leaving', async () => {
    const user = userEvent.setup();
    const guidedKey = draftStorageKey({ userId: 'user-1', mode: 'guided-create' });
    renderGuided({ draftOwnerId: 'user-1' });
    await user.type(screen.getByLabelText('Recipe name'), 'Fresh edit');

    await user.click(screen.getByRole('button', { name: 'Back to recipes' }));
    await user.click(screen.getByRole('button', { name: 'Leave' }));

    await waitFor(() => expect(window.localStorage.getItem(guidedKey)).not.toBeNull());
    expect(window.localStorage.getItem(guidedKey)).toContain('Fresh edit');
    expect(push).toHaveBeenCalledWith('/recipes');
  });
});
