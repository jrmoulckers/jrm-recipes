import type { ReactElement } from 'react';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { IntlWrapper } from '~/test/intl';
import { importRecipeFromUrlAction, importRecipeTextAction } from '~/server/recipes/actions';
import type { ImportedRecipe } from '~/server/recipes/import';
import { ImportRecipePanel } from './import-recipe-panel';

const auth = vi.hoisted(() => ({
  isLoaded: true,
  userId: null as string | null,
  openSignIn: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@clerk/nextjs', async () => {
  const { cloneElement } = await import('react');
  return {
    useAuth: () => ({ isLoaded: auth.isLoaded, userId: auth.userId }),
    SignInButton: ({
      children,
      mode,
    }: {
      children: ReactElement<{ onClick: () => void }>;
      mode: string;
    }) =>
      cloneElement(children, {
        onClick: () => auth.openSignIn(mode),
      }),
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => auth,
}));

vi.mock('~/server/recipes/actions', () => ({
  importRecipeFromUrlAction: vi.fn(),
  importRecipeTextAction: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const sourceUrl = 'https://heirloom.jrmoulckers.com/recipes/spaghetti-carbonara';
const sourceText = 'QA toast\n\nIngredients\n1 slice bread\n\nInstructions\n1. Toast the bread.';
const importedRecipe: ImportedRecipe = {
  title: 'QA toast',
  description: '',
  coverImageUrl: '',
  servings: '',
  servingsNoun: '',
  prepMinutes: '',
  cookMinutes: '',
  cuisine: '',
  cuisines: '',
  mealTypes: '',
  sourceName: 'QA recipe author',
  sourceUrl,
  tags: '',
  ingredients: [
    {
      section: '',
      quantity: '1',
      quantityMax: '',
      unit: 'slice',
      item: 'bread',
      note: '',
      optional: false,
    },
  ],
  steps: [
    {
      section: '',
      instruction: 'Toast the bread.',
      imageUrl: '',
      videoUrl: '',
      timerMinutes: '',
      techniques: '',
    },
  ],
};
const onImported = vi.fn();

function panel({
  signedIn = false,
  authConfigured = false,
  initialUrl,
}: {
  signedIn?: boolean;
  authConfigured?: boolean;
  initialUrl?: string;
} = {}) {
  return (
    <IntlWrapper>
      <ImportRecipePanel
        onImported={onImported}
        existingIngredients={[]}
        existingSteps={[]}
        photoReplaceConfirm="Replace these rows?"
        urlLabel="Recipe link"
        signedIn={signedIn}
        authConfigured={authConfigured}
        initialUrl={initialUrl}
      />
      <section id="editor-basics" tabIndex={-1}>
        <input aria-label="Manual recipe title" defaultValue="My own draft" />
      </section>
    </IntlWrapper>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  auth.isLoaded = true;
  auth.userId = null;
  vi.mocked(importRecipeFromUrlAction).mockRejectedValue(new Error('UNAUTHENTICATED'));
  vi.mocked(importRecipeTextAction).mockRejectedValue(new Error('UNAUTHENTICATED'));
});

afterEach(cleanup);

describe('guest import recovery (#1209)', () => {
  it('explains the prerequisite, retains a URL, and guards Enter as well as the button', async () => {
    const user = userEvent.setup();
    const view = render(panel());
    const input = screen.getByRole('textbox', { name: 'Recipe link' });
    await user.type(input, sourceUrl);
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: 'Import' }));

    expect(importRecipeFromUrlAction).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Sign in to import');
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
    expect(input).toHaveValue(sourceUrl);
    expect(screen.getByRole('link', { name: 'Write the recipe myself' })).toHaveAttribute(
      'href',
      '#editor-basics',
    );
    expect(screen.getByText(/Sign-in is unavailable in this environment/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Sign in to import' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Manual recipe title' })).toHaveValue(
      'My own draft',
    );

    view.rerender(panel({ signedIn: true }));
    expect(input).toHaveValue(sourceUrl);
    expect(screen.getByRole('button', { name: 'Import' })).toBeEnabled();
    expect(importRecipeFromUrlAction).not.toHaveBeenCalled();
  });

  it('retains mounted text and manual inputs through mocked modal sign-in and an auth refresh', async () => {
    const user = userEvent.setup();
    const view = render(panel({ authConfigured: true }));
    await user.click(screen.getByRole('tab', { name: 'Paste text' }));
    const input = screen.getByRole('textbox', { name: 'Recipe text to import' });
    fireEvent.change(input, { target: { value: sourceText } });
    await user.click(screen.getByRole('button', { name: 'Use this text' }));
    expect(importRecipeTextAction).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Use this text' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Sign in to import' }));
    expect(auth.openSignIn).toHaveBeenCalledWith('modal');
    expect(input).toHaveValue(sourceText);
    auth.userId = 'clerk-test-user';
    view.rerender(panel({ authConfigured: true }));
    await waitFor(() => expect(auth.refresh).toHaveBeenCalledTimes(1));
    expect(importRecipeTextAction).not.toHaveBeenCalled();

    view.rerender(panel({ signedIn: true, authConfigured: true }));
    expect(input).toHaveValue(sourceText);
    expect(screen.getByRole('textbox', { name: 'Manual recipe title' })).toHaveValue(
      'My own draft',
    );
    vi.mocked(importRecipeTextAction).mockResolvedValue({ ok: true, recipe: importedRecipe });
    await user.click(screen.getByRole('button', { name: 'Use this text' }));
    await waitFor(() => expect(onImported).toHaveBeenCalledWith(importedRecipe));
    expect(importRecipeTextAction).toHaveBeenCalledWith(sourceText);
    expect(input).toHaveValue('');
  });

  it('defers a shared URL until authenticated and imports it exactly once', async () => {
    auth.isLoaded = false;
    const view = render(panel({ authConfigured: true, initialUrl: sourceUrl }));
    expect(screen.getByRole('button', { name: 'Sign in to import' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Recipe link' })).toHaveValue(sourceUrl);
    expect(importRecipeFromUrlAction).not.toHaveBeenCalled();

    auth.isLoaded = true;
    view.rerender(panel({ authConfigured: true, initialUrl: sourceUrl }));
    expect(screen.getByRole('button', { name: 'Sign in to import' })).toBeEnabled();
    expect(importRecipeFromUrlAction).not.toHaveBeenCalled();
    vi.mocked(importRecipeFromUrlAction).mockResolvedValue({ ok: true, recipe: importedRecipe });
    view.rerender(panel({ signedIn: true, authConfigured: true, initialUrl: sourceUrl }));
    await waitFor(() => expect(onImported).toHaveBeenCalledWith(importedRecipe));
    view.rerender(panel({ signedIn: true, authConfigured: true, initialUrl: sourceUrl }));
    expect(importRecipeFromUrlAction).toHaveBeenCalledExactlyOnceWith(sourceUrl);
    expect(screen.getByRole('textbox', { name: 'Recipe link' })).toHaveValue('');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('applies the same authentication prerequisite before photo selection without changing parsing', async () => {
    const user = userEvent.setup();
    const view = render(panel());
    await user.click(screen.getByRole('tab', { name: 'Scan a photo' }));
    expect(screen.getByRole('status')).toHaveTextContent('Sign in to import');
    expect(screen.queryByLabelText('Choose a photo')).not.toBeInTheDocument();
    expect(importRecipeTextAction).not.toHaveBeenCalled();
    view.rerender(panel({ signedIn: true }));
    expect(screen.getByLabelText('Choose a photo')).toBeInTheDocument();
  });
});

describe('authenticated import controls', () => {
  it('imports a typed URL, applies author data intact, and clears only a successful source', async () => {
    const user = userEvent.setup();
    vi.mocked(importRecipeFromUrlAction).mockResolvedValue({ ok: true, recipe: importedRecipe });
    render(panel({ signedIn: true }));
    const input = screen.getByRole('textbox', { name: 'Recipe link' });
    fireEvent.change(input, { target: { value: ` ${sourceUrl} ` } });
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(importRecipeFromUrlAction).toHaveBeenCalledExactlyOnceWith(sourceUrl);
    expect(onImported).toHaveBeenCalledWith(importedRecipe);
    expect(input).toHaveValue('');
    expect(screen.queryByText(/Sign in to import/)).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Manual recipe title' })).toHaveValue(
      'My own draft',
    );
  });

  it('retains a URL on both returned and thrown authenticated failures', async () => {
    const user = userEvent.setup();
    vi.mocked(importRecipeFromUrlAction)
      .mockResolvedValueOnce({ ok: false, error: 'Recipe not found.' })
      .mockRejectedValueOnce(new Error('Network unavailable'));
    render(panel({ signedIn: true }));
    const input = screen.getByRole('textbox', { name: 'Recipe link' });
    fireEvent.change(input, { target: { value: sourceUrl } });
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(input).toHaveValue(sourceUrl);
    expect(toast.error).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(toast.error).toHaveBeenLastCalledWith('Something went wrong importing that link.');
    expect(input).toHaveValue(sourceUrl);
    expect(onImported).not.toHaveBeenCalled();
  });

  it('retains text on both returned and thrown authenticated failures', async () => {
    const user = userEvent.setup();
    vi.mocked(importRecipeTextAction)
      .mockResolvedValueOnce({ ok: false, error: 'Recipe not found.' })
      .mockRejectedValueOnce(new Error('Network unavailable'));
    render(panel({ signedIn: true }));
    await user.click(screen.getByRole('tab', { name: 'Paste text' }));
    const input = screen.getByRole('textbox', { name: 'Recipe text to import' });
    fireEvent.change(input, { target: { value: sourceText } });
    await user.click(screen.getByRole('button', { name: 'Use this text' }));
    expect(input).toHaveValue(sourceText);
    expect(toast.error).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Use this text' }));
    expect(toast.error).toHaveBeenLastCalledWith('Something went wrong reading that text.');
    expect(input).toHaveValue(sourceText);
    expect(onImported).not.toHaveBeenCalled();
  });
});
