import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import esMessages from '~/messages/es.json';
import { IntlWrapper } from '~/test/intl';
import { WELCOME_DISMISS_KEY, WelcomeChecklist, welcomeDismissed } from './welcome-checklist';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('WelcomeChecklist (issue #147)', () => {
  it('presents the create → cook → share loop as three steps with a primary CTA', () => {
    render(<WelcomeChecklist />, { wrapper: IntlWrapper });

    expect(screen.getByRole('heading', { name: /welcome to heirloom/i })).toBeInTheDocument();
    expect(screen.getByText('Create a recipe')).toBeInTheDocument();
    expect(screen.getByText('Cook it hands-free')).toBeInTheDocument();
    expect(screen.getByText('Share with family')).toBeInTheDocument();

    const cta = screen.getByRole('link', { name: /create your first recipe/i });
    expect(cta).toHaveAttribute('href', '/recipes/new');
  });

  it('persists dismissal so it never reappears', async () => {
    render(<WelcomeChecklist />, { wrapper: IntlWrapper });

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss welcome' }));

    // Dismissal is persisted immediately. The card then eases out and unmounts.
    expect(window.localStorage.getItem(WELCOME_DISMISS_KEY)).toBe('1');
    expect(welcomeDismissed()).toBe(true);
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /welcome to heirloom/i })).toBeNull(),
    );
  });

  it('stays hidden when already dismissed', () => {
    window.localStorage.setItem(WELCOME_DISMISS_KEY, '1');
    render(<WelcomeChecklist />, { wrapper: IntlWrapper });

    expect(screen.queryByRole('heading', { name: /welcome to heirloom/i })).toBeNull();
  });

  it('renders its copy from the catalog, not hardcoded English', () => {
    // Asserting in Spanish is the point: an English assertion would still pass
    // if the component fell back to literals baked into the JSX.
    render(<WelcomeChecklist />, {
      wrapper: ({ children }) => (
        <IntlWrapper locale="es" messages={esMessages}>
          {children}
        </IntlWrapper>
      ),
    });

    expect(screen.getByText('Crea una receta')).toBeInTheDocument();
    expect(screen.getByText('Cocina sin manos')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /crea tu primera receta/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descartar la bienvenida' })).toBeInTheDocument();
  });
});
