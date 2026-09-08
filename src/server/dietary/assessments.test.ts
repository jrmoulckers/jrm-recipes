import { describe, expect, it } from 'vitest';

import {
  canManageCanonicalDietaryAssessment,
  canReadCanonicalDietaryAssessment,
  canReadOwnedDietaryScope,
  type DietaryRecipeAccess,
} from './assessments';

function access(overrides: Partial<DietaryRecipeAccess> = {}): DietaryRecipeAccess {
  return {
    actorId: null,
    authorId: 'owner',
    visibility: 'private',
    acceptedCreator: false,
    groupRole: null,
    ...overrides,
  };
}

describe('dietary assessment authorization', () => {
  it('allows anonymous readers only for canonical facts on public recipes', () => {
    expect(canReadCanonicalDietaryAssessment(access({ visibility: 'public' }))).toBe(true);
    expect(canReadCanonicalDietaryAssessment(access())).toBe(false);
    expect(canReadCanonicalDietaryAssessment(access({ authorId: null, actorId: null }))).toBe(
      false,
    );
    expect(canReadOwnedDietaryScope(null, 'owner')).toBe(false);
  });

  it('allows the recipe owner and accepted co-creators to manage canonical facts', () => {
    expect(canManageCanonicalDietaryAssessment(access({ actorId: 'owner' }))).toBe(true);
    expect(
      canManageCanonicalDietaryAssessment(access({ actorId: 'creator', acceptedCreator: true })),
    ).toBe(true);
  });

  it.each(['owner', 'admin', 'member', 'kid'] as const)(
    'lets a %s group member read but not manage canonical facts',
    (groupRole) => {
      const member = access({ actorId: `${groupRole}-user`, groupRole });
      member.visibility = 'group';
      expect(canReadCanonicalDietaryAssessment(member)).toBe(true);
      expect(canManageCanonicalDietaryAssessment(member)).toBe(false);
    },
  );

  it('does not widen private or unlisted recipe access through group membership', () => {
    expect(
      canReadCanonicalDietaryAssessment(
        access({ actorId: 'member', groupRole: 'member', visibility: 'private' }),
      ),
    ).toBe(false);
    expect(
      canReadCanonicalDietaryAssessment(
        access({ actorId: 'kid', groupRole: 'kid', visibility: 'unlisted' }),
      ),
    ).toBe(false);
  });

  it('denies unrelated signed-in users', () => {
    const stranger = access({ actorId: 'stranger' });
    expect(canReadCanonicalDietaryAssessment(stranger)).toBe(false);
    expect(canManageCanonicalDietaryAssessment(stranger)).toBe(false);
  });

  it('keeps personal and profile scopes owner-only', () => {
    expect(canReadOwnedDietaryScope('profile-owner', 'profile-owner')).toBe(true);
    expect(canReadOwnedDietaryScope('group-member', 'profile-owner')).toBe(false);
    expect(canReadOwnedDietaryScope('kid', 'profile-owner')).toBe(false);
  });
});
