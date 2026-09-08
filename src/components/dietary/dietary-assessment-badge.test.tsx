import { cleanup, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

import { DietaryAssessmentBadge } from './dietary-assessment-badge';
import arMessages from '~/messages/ar.json';
import { IntlWrapper } from '~/test/intl';

function render(ui: ReactElement) {
  return rtlRender(<IntlWrapper>{ui}</IntlWrapper>);
}

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
});

afterEach(cleanup);

const BASE_PROPS = {
  label: 'Gluten-free',
  status: 'suitability',
  recognizedIngredients: 8,
  totalIngredients: 9,
} as const;

describe('DietaryAssessmentBadge', () => {
  it('opens from the keyboard, exposes structured details, and restores focus on Escape', async () => {
    const user = userEvent.setup();
    render(
      <DietaryAssessmentBadge
        {...BASE_PROPS}
        provenance={{ kind: 'ingredient-analyzed', confidence: 'high' }}
        attentionIngredients={[{ name: 'seasoning blend', kind: 'unresolved' }]}
      />,
    );

    await user.tab();
    const trigger = screen.getByRole('button', {
      name: 'Gluten-free. Status: Suitable. Ingredient-analyzed, High confidence',
    });
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.keyboard('{Enter}');

    const details = await screen.findByRole('dialog', {
      name: 'Gluten-free dietary assessment',
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(details).toHaveFocus();
    expect(details).toHaveTextContent('Ingredient analysis');
    expect(details).toHaveTextContent('Confidence: High');
    expect(details).toHaveTextContent('8 of 9 ingredients recognized');
    expect(details).toHaveTextContent('seasoning blend: Needs review');
    expect(details).not.toHaveTextContent('%');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('announces author confirmation and its source in the trigger name', () => {
    render(
      <DietaryAssessmentBadge
        {...BASE_PROPS}
        label="Vegetarian"
        provenance={{ kind: 'author-confirmed', source: 'Recipe author' }}
      />,
    );

    expect(
      screen.getByRole('button', {
        name: 'Vegetarian. Status: Suitable. Confirmed by Recipe author',
      }),
    ).toBeInTheDocument();
  });

  it('opens with Space as a native button control', async () => {
    const user = userEvent.setup();
    render(
      <DietaryAssessmentBadge
        {...BASE_PROPS}
        provenance={{ kind: 'author-confirmed', source: 'Recipe author' }}
      />,
    );

    await user.tab();
    await user.keyboard(' ');

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('keeps status styling independent from the distinct provenance icons', () => {
    const { container } = render(
      <div>
        <DietaryAssessmentBadge
          {...BASE_PROPS}
          provenance={{ kind: 'author-confirmed', source: 'Recipe author' }}
        />
        <DietaryAssessmentBadge
          {...BASE_PROPS}
          provenance={{ kind: 'ingredient-analyzed', confidence: 'medium' }}
        />
      </div>,
    );

    const [confirmed, analyzed] = screen.getAllByRole('button');
    expect(confirmed).toHaveClass('bg-success/15');
    expect(analyzed).toHaveClass('bg-success/15');
    expect(
      container.querySelector('[data-provenance-icon="author-confirmed"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-provenance-icon="ingredient-analyzed"]'),
    ).toBeInTheDocument();
  });

  it.each([
    ['suitability', 'Suitable', 'success'],
    ['conflict', 'Conflict', 'destructive'],
    ['review', 'Needs review', 'warning'],
  ] as const)(
    'pairs %s status with text, icon, and %s styling',
    async (status, statusLabel, variant) => {
      const user = userEvent.setup();
      const { container } = render(
        <DietaryAssessmentBadge
          {...BASE_PROPS}
          status={status}
          provenance={{ kind: 'ingredient-analyzed', confidence: 'needs-review' }}
        />,
      );

      const trigger = screen.getByRole('button', { name: new RegExp(`Status: ${statusLabel}`) });
      expect(trigger).toHaveClass(
        variant === 'success'
          ? 'bg-success/15'
          : variant === 'destructive'
            ? 'bg-destructive/15'
            : 'bg-warning/20',
      );
      expect(container.querySelector(`[data-status-icon="${status}"]`)).toBeInTheDocument();

      await user.click(trigger);
      expect(await screen.findByRole('dialog')).toHaveTextContent(statusLabel);
    },
  );

  it('lists only supplied attention ingredients', async () => {
    const user = userEvent.setup();
    render(
      <DietaryAssessmentBadge
        {...BASE_PROPS}
        status="conflict"
        provenance={{ kind: 'ingredient-analyzed', confidence: 'high' }}
        attentionIngredients={[
          { name: 'soy sauce', kind: 'conflict' },
          { name: 'spice mix', kind: 'unresolved' },
        ]}
      />,
    );

    await user.click(screen.getByRole('button'));
    const details = await screen.findByRole('dialog');
    const attention = within(details).getByRole('heading', {
      name: 'Needs attention',
    }).parentElement;
    expect(attention).toHaveTextContent('soy sauce: Conflict');
    expect(attention).toHaveTextContent('spice mix: Needs review');
    expect(attention).not.toHaveTextContent('olive oil');
  });

  it('keeps dense localized details scrollable so the limitation and action remain reachable', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const attentionIngredients = Array.from({ length: 12 }, (_, index) => ({
      name: `very long unresolved ingredient label ${index + 1}`,
      kind: 'unresolved' as const,
    }));

    render(
      <DietaryAssessmentBadge
        {...BASE_PROPS}
        status="review"
        provenance={{ kind: 'ingredient-analyzed', confidence: 'needs-review' }}
        attentionIngredients={attentionIngredients}
        action={{ kind: 'review', onSelect }}
      />,
    );

    await user.click(screen.getByRole('button'));
    const details = await screen.findByRole('dialog');
    expect(details).toHaveClass(
      'max-h-[calc(var(--radix-popover-content-available-height)-1rem)]',
      'overflow-y-auto',
      'overscroll-contain',
    );
    expect(details).toHaveTextContent('very long unresolved ingredient label 12');
    expect(details).toHaveTextContent(
      'Ingredient review cannot verify every brand or cross-contact.',
    );

    const action = within(details).getByRole('button', { name: 'Review details' });
    expect(action).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(onSelect).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('allows long RTL labels to wrap instead of truncating critical text', () => {
    rtlRender(
      <IntlWrapper locale="ar" messages={arMessages}>
        <div dir="rtl" className="max-w-64">
          <DietaryAssessmentBadge
            {...BASE_PROPS}
            label="مناسب لنظام غذائي نباتي صارم مع وصف تفصيلي طويلللللللللللللللللللللللل"
            provenance={{ kind: 'ingredient-analyzed', confidence: 'medium' }}
          />
        </div>
      </IntlWrapper>,
    );

    const trigger = screen.getByRole('button');
    expect(trigger).toHaveClass('min-h-11', 'max-w-full', 'whitespace-normal', 'text-start');
    expect(trigger).not.toHaveClass('truncate', 'whitespace-nowrap');
    expect(within(trigger).getByText(/مناسب لنظام/)).toHaveClass('min-w-0', 'break-words');
  });

  it('renders an authorized action only when supplied and closes after activation', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { rerender } = render(
      <DietaryAssessmentBadge
        {...BASE_PROPS}
        provenance={{ kind: 'ingredient-analyzed', confidence: 'medium' }}
      />,
    );

    await user.click(screen.getByRole('button'));
    expect(screen.queryByRole('button', { name: 'Review details' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    rerender(
      <IntlWrapper>
        <DietaryAssessmentBadge
          {...BASE_PROPS}
          provenance={{ kind: 'ingredient-analyzed', confidence: 'medium' }}
          action={{ kind: 'review', onSelect }}
        />
      </IntlWrapper>,
    );

    const trigger = screen.getByRole('button');
    await user.click(trigger);
    await user.click(await screen.findByRole('button', { name: 'Review details' }));

    expect(onSelect).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('supports a contextual Family upgrade action for unresolved evidence', async () => {
    const user = userEvent.setup();
    render(
      <DietaryAssessmentBadge
        {...BASE_PROPS}
        status="review"
        provenance={{ kind: 'ingredient-analyzed', confidence: 'needs-review' }}
        attentionIngredients={[{ name: 'seasoning blend', kind: 'unresolved' }]}
        action={{ kind: 'upgrade', href: '/pricing' }}
      />,
    );

    await user.click(screen.getByRole('button'));
    expect(await screen.findByRole('link', { name: 'Resolve with Family' })).toHaveAttribute(
      'href',
      '/pricing',
    );
  });
});
