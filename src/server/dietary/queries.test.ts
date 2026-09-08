import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeUser } from '~/test/factories';
import { createDbMock, useDbMock, type DbMock, type QueryTableMock } from '~/test/harness';

vi.mock('server-only', () => ({}));
vi.mock('~/server/db', async () => (await import('~/test/harness')).dbModuleMock());

import { listCustomRestrictionsForProfiles } from './queries';

describe('listCustomRestrictionsForProfiles', () => {
  let db: DbMock;
  let profileQuery: QueryTableMock;
  let restrictionQuery: QueryTableMock;
  const user = makeUser({ id: 'owner_1' });

  beforeEach(() => {
    db = useDbMock(createDbMock(['memberDietaryProfiles', 'customDietaryRestrictions']));
    profileQuery = db.query.memberDietaryProfiles!;
    restrictionQuery = db.query.customDietaryRestrictions!;
  });

  it('returns terms only after every requested profile is owner-verified', async () => {
    const restrictions = [
      {
        id: 'restriction_1',
        profileId: 'profile_1',
        name: 'Nightshades',
        severity: 'strict-avoidance',
        terms: [
          { term: 'tomato', source: 'exact', approved: true },
          { term: 'aubergine', source: 'suggested', approved: false },
        ],
      },
    ];
    profileQuery.findMany.mockResolvedValue([{ id: 'profile_1' }, { id: 'profile_2' }]);
    restrictionQuery.findMany.mockResolvedValue(restrictions);

    await expect(
      listCustomRestrictionsForProfiles(['profile_1', 'profile_2', 'profile_1'], user),
    ).resolves.toEqual(restrictions);
    expect(profileQuery.findMany).toHaveBeenCalledOnce();
    expect(restrictionQuery.findMany).toHaveBeenCalledOnce();
  });

  it('fails the whole read if any profile is not owned', async () => {
    profileQuery.findMany.mockResolvedValue([{ id: 'profile_1' }]);

    await expect(
      listCustomRestrictionsForProfiles(['profile_1', 'foreign_profile'], user),
    ).rejects.toThrow('NOT_FOUND');
    expect(restrictionQuery.findMany).not.toHaveBeenCalled();
  });

  it('returns an empty list without querying for an empty profile selection', async () => {
    await expect(listCustomRestrictionsForProfiles([], user)).resolves.toEqual([]);
    expect(profileQuery.findMany).not.toHaveBeenCalled();
    expect(restrictionQuery.findMany).not.toHaveBeenCalled();
  });
});
