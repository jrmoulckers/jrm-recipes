import { cleanup, render as rtlRender, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';

import { IntlWrapper } from '~/test/intl';
import esMessages from '~/messages/es.json';
import { AllergenSummary } from './allergen-summary';

afterEach(cleanup);

/** The summary is copy-heavy, so it is asserted against the Spanish catalog:
 *  a passing run proves the strings really come from the catalogs. */
function render(ui: ReactElement) {
  return rtlRender(
    <IntlWrapper locale="es" messages={esMessages}>
      {ui}
    </IntlWrapper>,
  );
}

describe('AllergenSummary', () => {
  it('lists detected allergens as a Contains summary', () => {
    render(<AllergenSummary items={['2 large eggs', '1 cup whole milk', 'flour']} />);

    const region = screen.getByRole('region', {
      name: /resumen de alérgenos/i,
    });
    expect(within(region).getByText(/contiene/i)).toHaveClass('text-foreground');

    const badges = within(region).getByRole('list');
    const labels = within(badges)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(labels).toEqual(['Dairy', 'Eggs', 'Wheat/gluten']);
  });

  it('shows a best-effort disclaimer alongside the badges', () => {
    render(<AllergenSummary items={['peanut butter']} />);
    expect(
      screen.getByText(/revisa siempre los ingredientes si hay alergias/i),
    ).toBeInTheDocument();
  });

  it('renders a non-alarming empty state that never claims safety', () => {
    render(<AllergenSummary items={['olive oil', 'kosher salt']} />);
    expect(screen.queryByText(/^contiene$/i)).not.toBeInTheDocument();
    expect(screen.getByText(/no se detectaron alérgenos comunes/i)).toBeInTheDocument();
    expect(screen.getByText(/revisa siempre los ingredientes/i)).toBeInTheDocument();
  });

  it("surfaces derived allergens under an 'Often hides' note", () => {
    render(<AllergenSummary items={['chicken breast', 'soy sauce']} />);

    const region = screen.getByRole('region', {
      name: /resumen de alérgenos/i,
    });
    expect(within(region).getByText(/suele esconder/i)).toBeInTheDocument();

    const hiddenList = within(region).getByRole('list', {
      name: /posibles alérgenos ocultos/i,
    });
    expect(within(hiddenList).getByText('Wheat/gluten')).toBeInTheDocument();
    // The cautionary label note is shown.
    expect(screen.getByText(/check for a gluten-free tamari/i)).toBeInTheDocument();
  });

  it('keeps direct and hidden allergens in separate sections', () => {
    render(<AllergenSummary items={['all-purpose flour', 'soy sauce']} />);

    // Wheat is direct here, so it must not be repeated as hidden.
    const contains = screen.getByRole('list', {
      name: /alérgenos que contiene/i,
    });
    expect(within(contains).getByText('Wheat/gluten')).toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: /posibles alérgenos ocultos/i }),
    ).not.toBeInTheDocument();
  });

  it('resolves its copy from the English catalog too', () => {
    rtlRender(
      <IntlWrapper>
        <AllergenSummary items={['olive oil', 'kosher salt']} />
      </IntlWrapper>,
    );
    expect(screen.getByText(/no common allergens detected/i)).toBeInTheDocument();
  });
});
