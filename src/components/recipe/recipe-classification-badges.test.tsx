import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { IntlWrapper } from '~/test/intl';
import { RecipeClassificationBadges } from './recipe-classification-badges';

afterEach(cleanup);

describe('RecipeClassificationBadges', () => {
  it('leaves dietary claims to the assessment UI', () => {
    render(
      <IntlWrapper>
        <RecipeClassificationBadges
          items={[
            { slug: 'dinner', name: 'Dinner', category: 'meal' },
            { slug: 'vegan', name: 'Vegan', category: 'dietary' },
          ]}
        />
      </IntlWrapper>,
    );

    expect(screen.getByText('Dinner')).toBeInTheDocument();
    expect(screen.queryByText('Vegan')).not.toBeInTheDocument();
  });
});
