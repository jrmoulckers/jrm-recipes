/* eslint-disable drizzle/enforce-delete-with-where -- assertions exercise mocked scoped builders */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeUser } from '~/test/factories';
import {
  chainable,
  createDbMock,
  useDbMock,
  type DbMock,
  type QueryTableMock,
} from '~/test/harness';

vi.mock('server-only', () => ({}));
vi.mock('~/server/db', async () => (await import('~/test/harness')).dbModuleMock());

import {
  copyCustomDietaryRestriction,
  createCustomDietaryRestriction,
  deleteCustomDietaryRestriction,
  updateCustomDietaryRestriction,
} from './mutations';

const input = {
  name: 'Nightshades',
  severity: 'strict-avoidance' as const,
  terms: [
    { term: 'tomato', source: 'exact' as const, approved: true },
    { term: 'aubergine', source: 'suggested' as const, approved: false },
  ],
};

describe('custom dietary restriction mutations', () => {
  let db: DbMock;
  let profileQuery: QueryTableMock;
  let restrictionQuery: QueryTableMock;
  const user = makeUser({ id: 'owner_1' });

  beforeEach(() => {
    db = useDbMock(createDbMock(['memberDietaryProfiles', 'customDietaryRestrictions']));
    profileQuery = db.query.memberDietaryProfiles!;
    restrictionQuery = db.query.customDietaryRestrictions!;
    profileQuery.findFirst.mockResolvedValue({ id: 'profile_1' });
    restrictionQuery.findFirst.mockResolvedValue({
      id: 'restriction_1',
      profileId: 'profile_1',
      name: input.name,
      severity: input.severity,
      profile: { userId: user.id },
      terms: input.terms,
    });
  });

  it('checks profile ownership before creating and preserves term provenance', async () => {
    const inserted: unknown[] = [];
    db.insert.mockImplementation(() => ({
      values: (values?: unknown) => {
        inserted.push(values);
        return Array.isArray(values) ? chainable() : chainable([{ id: 'restriction_2' }]);
      },
    }));

    await expect(createCustomDietaryRestriction('profile_1', input, user)).resolves.toEqual({
      id: 'restriction_2',
    });
    expect(profileQuery.findFirst).toHaveBeenCalledOnce();
    expect(inserted[1]).toEqual([
      {
        restrictionId: 'restriction_2',
        term: 'tomato',
        source: 'exact',
        approved: true,
      },
      {
        restrictionId: 'restriction_2',
        term: 'aubergine',
        source: 'suggested',
        approved: false,
      },
    ]);

    profileQuery.findFirst.mockResolvedValue(undefined);
    db.insert.mockClear();
    await expect(createCustomDietaryRestriction('foreign_profile', input, user)).rejects.toThrow(
      'NOT_FOUND',
    );
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('replaces terms and invalidates dependent assessments in one transaction', async () => {
    const inserted: unknown[] = [];
    const updated: unknown[] = [];
    db.insert.mockImplementation(() => ({
      values: (values?: unknown) => {
        inserted.push(values);
        return chainable();
      },
    }));
    db.update.mockImplementation(() => ({
      set: (values?: unknown) => {
        updated.push(values);
        return { where: () => Promise.resolve(undefined) };
      },
    }));

    await expect(updateCustomDietaryRestriction('restriction_1', input, user)).resolves.toEqual({
      id: 'restriction_1',
    });

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(db.delete).toHaveBeenCalledOnce();
    expect(inserted).toEqual([
      [
        {
          restrictionId: 'restriction_1',
          term: 'tomato',
          source: 'exact',
          approved: true,
        },
        {
          restrictionId: 'restriction_1',
          term: 'aubergine',
          source: 'suggested',
          approved: false,
        },
      ],
    ]);
    expect(updated[0]).toMatchObject({
      name: 'Nightshades',
      severity: 'strict-avoidance',
    });
    expect(updated[1]).toMatchObject({
      invalidatedAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });
  });

  it('does not update or delete a restriction owned by another user', async () => {
    restrictionQuery.findFirst.mockResolvedValue({
      id: 'restriction_1',
      profileId: 'profile_2',
      name: input.name,
      severity: input.severity,
      profile: { userId: 'other_user' },
      terms: input.terms,
    });

    await expect(updateCustomDietaryRestriction('restriction_1', input, user)).rejects.toThrow(
      'NOT_FOUND',
    );
    await expect(deleteCustomDietaryRestriction('restriction_1', user)).rejects.toThrow(
      'NOT_FOUND',
    );
    expect(db.update).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('hard-deletes an owned restriction after checking ownership', async () => {
    await expect(deleteCustomDietaryRestriction('restriction_1', user)).resolves.toEqual({
      id: 'restriction_1',
    });
    expect(restrictionQuery.findFirst).toHaveBeenCalledOnce();
    expect(db.delete).toHaveBeenCalledOnce();
  });

  it('checks both source and target ownership when copying', async () => {
    profileQuery.findFirst.mockResolvedValue(undefined);

    await expect(
      copyCustomDietaryRestriction('restriction_1', 'foreign_profile', user),
    ).rejects.toThrow('NOT_FOUND');
    expect(restrictionQuery.findFirst).toHaveBeenCalledOnce();
    expect(profileQuery.findFirst).toHaveBeenCalledOnce();
    expect(db.insert).not.toHaveBeenCalled();

    restrictionQuery.findFirst.mockResolvedValue({
      id: 'restriction_1',
      profileId: 'profile_2',
      name: input.name,
      severity: input.severity,
      profile: { userId: 'other_user' },
      terms: input.terms,
    });
    profileQuery.findFirst.mockClear();
    await expect(copyCustomDietaryRestriction('restriction_1', 'profile_1', user)).rejects.toThrow(
      'NOT_FOUND',
    );
    expect(profileQuery.findFirst).not.toHaveBeenCalled();
  });

  it('copies suggested aliases without approving or converting them', async () => {
    const inserted: unknown[] = [];
    db.insert.mockImplementation(() => ({
      values: (values?: unknown) => {
        inserted.push(values);
        return Array.isArray(values) ? chainable() : chainable([{ id: 'restriction_copy' }]);
      },
    }));

    await expect(copyCustomDietaryRestriction('restriction_1', 'profile_2', user)).resolves.toEqual(
      { id: 'restriction_copy' },
    );
    expect(inserted[1]).toEqual([
      {
        restrictionId: 'restriction_copy',
        term: 'tomato',
        source: 'exact',
        approved: true,
      },
      {
        restrictionId: 'restriction_copy',
        term: 'aubergine',
        source: 'suggested',
        approved: false,
      },
    ]);
  });
});
