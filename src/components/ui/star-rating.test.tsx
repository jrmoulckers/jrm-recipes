import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StarRating } from './star-rating';

vi.mock('~/lib/use-reduced-motion', () => ({ useReducedMotion: () => false }));

const labels = {
  label: 'Your star rating',
  starLabel: (value: number) => `Rate ${value} ${value === 1 ? 'star' : 'stars'}`,
};

function filledCount(container: HTMLElement): number {
  return container.querySelectorAll('.fill-amber-400').length;
}

afterEach(cleanup);

describe('StarRating (#1010)', () => {
  it('previews a fill across every star up to the hovered one', async () => {
    const user = userEvent.setup();
    const { container } = render(<StarRating value={null} onChange={vi.fn()} {...labels} />);

    expect(filledCount(container)).toBe(0);

    await user.hover(screen.getByRole('button', { name: 'Rate 3 stars' }));

    // Hovering the third star fills one, two, and three — not just the third.
    expect(filledCount(container)).toBe(3);
  });

  it('drops the preview back to the committed rating on mouse leave', async () => {
    const user = userEvent.setup();
    const { container } = render(<StarRating value={2} onChange={vi.fn()} {...labels} />);

    await user.hover(screen.getByRole('button', { name: 'Rate 5 stars' }));
    expect(filledCount(container)).toBe(5);

    await user.unhover(screen.getByRole('button', { name: 'Rate 5 stars' }));
    expect(filledCount(container)).toBe(2);
  });

  it('previews on keyboard focus too, so the affordance is not pointer-only (2.1.1)', async () => {
    const user = userEvent.setup();
    const { container } = render(<StarRating value={null} onChange={vi.fn()} {...labels} />);

    await user.tab();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Rate 2 stars' })).toHaveFocus();
    expect(filledCount(container)).toBe(2);
  });

  it('commits the clicked value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StarRating value={null} onChange={onChange} {...labels} />);

    await user.click(screen.getByRole('button', { name: 'Rate 4 stars' }));

    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('never previews while disabled, and keeps a visible focus ring (2.4.7)', async () => {
    const user = userEvent.setup();
    const { container } = render(<StarRating value={1} onChange={vi.fn()} disabled {...labels} />);

    const star = screen.getByRole('button', { name: 'Rate 5 stars' });
    expect(star).toBeDisabled();
    expect(star).toHaveClass('focus-visible:ring-2', 'focus-visible:ring-ring');

    await user.hover(star);
    expect(filledCount(container)).toBe(1);
  });

  it('marks the committed star with aria-pressed and labels the group', () => {
    render(<StarRating value={3} onChange={vi.fn()} {...labels} />);

    const group = screen.getByRole('group', { name: 'Your star rating' });
    expect(within(group).getByRole('button', { name: 'Rate 3 stars' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(group).getByRole('button', { name: 'Rate 4 stars' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('renders a non-interactive row with a single accessible name when read-only', () => {
    render(<StarRating value={4} label="4 out of 5 stars" />);

    expect(screen.getByRole('img', { name: '4 out of 5 stars' })).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
