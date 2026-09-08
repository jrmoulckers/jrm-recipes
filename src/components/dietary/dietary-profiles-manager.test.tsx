import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfirmProvider } from '~/components/ui/confirm-dialog';
import { IntlWrapper } from '~/test/intl';
import { DietaryProfilesManager } from './dietary-profiles-manager';

const { copyRestriction, updateRestriction } = vi.hoisted(() => ({
  copyRestriction: vi.fn().mockResolvedValue({ ok: true, id: 'restriction_copy' }),
  updateRestriction: vi.fn().mockResolvedValue({ ok: true, id: 'restriction_1' }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('~/server/dietary/actions', () => ({
  copyCustomDietaryRestrictionAction: copyRestriction,
  createCustomDietaryRestrictionAction: vi.fn(),
  createMemberProfileAction: vi.fn(),
  deleteCustomDietaryRestrictionAction: vi.fn(),
  deleteMemberProfileAction: vi.fn(),
  updateCustomDietaryRestrictionAction: updateRestriction,
  updateMemberProfileAction: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DietaryProfilesManager custom restrictions', () => {
  it('keeps exact Free terms separate while preserving Family suggestions on edit', async () => {
    const user = userEvent.setup();
    render(
      <IntlWrapper>
        <ConfirmProvider>
          <DietaryProfilesManager
            profiles={[
              {
                id: 'profile_1',
                name: 'Ada',
                allergens: [],
                diets: [],
                groupId: null,
                targets: [],
                customRestrictions: [
                  {
                    id: 'restriction_1',
                    name: 'Avoid rosemary',
                    severity: 'strict-avoidance',
                    terms: [
                      { term: 'rosemary', source: 'exact', approved: true },
                      { term: 'rosemary oil', source: 'suggested', approved: false },
                    ],
                  },
                ],
              },
            ]}
            groups={[]}
          />
        </ConfirmProvider>
      </IntlWrapper>,
    );

    expect(screen.getByText(/Free exact rules match only/)).toBeInTheDocument();
    expect(screen.getByText(/do not affect matching until approved/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit Avoid rosemary' }));
    const terms = screen.getByRole('textbox', { name: 'Exact terms' });
    await user.clear(terms);
    await user.type(terms, 'rosemary\nfresh rosemary');
    await user.click(screen.getByRole('button', { name: 'Save restriction' }));

    await waitFor(() =>
      expect(updateRestriction).toHaveBeenCalledWith('restriction_1', {
        name: 'Avoid rosemary',
        severity: 'strict-avoidance',
        terms: [
          { term: 'rosemary', source: 'exact', approved: true },
          { term: 'fresh rosemary', source: 'exact', approved: true },
          { term: 'rosemary oil', source: 'suggested', approved: false },
        ],
      }),
    );
  });

  it('copies a restriction only after the destination profile is chosen', async () => {
    const user = userEvent.setup();
    render(
      <IntlWrapper>
        <ConfirmProvider>
          <DietaryProfilesManager
            profiles={[
              {
                id: 'profile_1',
                name: 'Ada',
                allergens: [],
                diets: [],
                groupId: null,
                targets: [],
                customRestrictions: [
                  {
                    id: 'restriction_1',
                    name: 'Avoid rosemary',
                    severity: 'strict-avoidance',
                    terms: [{ term: 'rosemary', source: 'exact', approved: true }],
                  },
                ],
              },
              {
                id: 'profile_2',
                name: 'Grace',
                allergens: [],
                diets: [],
                groupId: null,
                targets: [],
                customRestrictions: [],
              },
            ]}
            groups={[]}
          />
        </ConfirmProvider>
      </IntlWrapper>,
    );

    await user.click(screen.getByRole('button', { name: 'Copy Avoid rosemary' }));
    expect(screen.getByRole('combobox', { name: 'Copy to' })).toHaveValue('profile_2');
    await user.click(screen.getByRole('button', { name: 'Copy restriction' }));

    await waitFor(() => expect(copyRestriction).toHaveBeenCalledWith('restriction_1', 'profile_2'));
  });
});
