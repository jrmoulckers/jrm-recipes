import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findFirstMock, transactionMock, deleteMock, getHiddenAuthorIdsMock, notifyMock } =
  vi.hoisted(() => ({
    findFirstMock: vi.fn(),
    transactionMock: vi.fn(),
    deleteMock: vi.fn(),
    getHiddenAuthorIdsMock: vi.fn(),
    notifyMock: vi.fn(),
  }));

vi.mock('~/server/db', () => ({
  db: {
    query: { users: { findFirst: findFirstMock } },
    transaction: transactionMock,
    delete: deleteMock,
  },
  isDbConfigured: () => true,
}));

vi.mock('~/server/moderation/blocks', () => ({
  getHiddenAuthorIds: getHiddenAuthorIdsMock,
}));

vi.mock('~/server/notifications/notify', () => ({
  notify: notifyMock,
}));

import { followUser, unfollowUser } from './mutations';

/** A tx whose insert(...).values(...).onConflictDoNothing(...).returning() resolves to `inserted`. */
function mockTx(inserted: { id: string }[]) {
  const returning = vi.fn(async () => inserted);
  const onConflictDoNothing = vi.fn(() => ({ returning }));
  const values = vi.fn(() => ({ onConflictDoNothing }));
  const insert = vi.fn(() => ({ values }));
  return { insert } as const;
}

beforeEach(() => {
  vi.clearAllMocks();
  getHiddenAuthorIdsMock.mockResolvedValue(new Set());
});

describe('followUser opt-in public graph', () => {
  it('rejects following yourself without touching the db', async () => {
    await expect(followUser('me', 'me')).rejects.toThrow('FORBIDDEN');
    expect(findFirstMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('rejects an unknown or deleted account', async () => {
    findFirstMock.mockResolvedValueOnce(undefined);
    await expect(followUser('me', 'ghost')).rejects.toThrow('USER_NOT_FOUND');

    findFirstMock.mockResolvedValueOnce({
      id: 'gone',
      publicActivityOptIn: true,
      deletedAt: new Date(),
    });
    await expect(followUser('me', 'gone')).rejects.toThrow('USER_NOT_FOUND');
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('rejects following a cook who has NOT opted in', async () => {
    findFirstMock.mockResolvedValue({
      id: 'private',
      publicActivityOptIn: false,
      deletedAt: null,
    });
    await expect(followUser('me', 'private')).rejects.toThrow('FORBIDDEN');
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('rejects when the viewer blocked the target (block wins over follow)', async () => {
    findFirstMock.mockResolvedValue({
      id: 'target',
      publicActivityOptIn: true,
      deletedAt: null,
    });
    getHiddenAuthorIdsMock.mockResolvedValue(new Set(['target']));
    await expect(followUser('me', 'target')).rejects.toThrow('FORBIDDEN');
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('rejects when the target blocked the viewer (symmetric block)', async () => {
    findFirstMock.mockResolvedValue({
      id: 'target',
      publicActivityOptIn: true,
      deletedAt: null,
    });
    // getHiddenAuthorIds returns a symmetric set, so a reverse block also lands here.
    getHiddenAuthorIdsMock.mockResolvedValue(new Set(['target']));
    await expect(followUser('me', 'target')).rejects.toThrow('FORBIDDEN');
  });

  it('inserts the edge and notifies the followee on a genuine new follow', async () => {
    findFirstMock.mockResolvedValue({
      id: 'target',
      publicActivityOptIn: true,
      deletedAt: null,
    });
    const tx = mockTx([{ id: 'follow_1' }]);
    transactionMock.mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx));

    await followUser('me', 'target');

    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(tx, {
      recipientId: 'target',
      actorId: 'me',
      type: 'follow',
    });
  });

  it('does NOT notify on a re-follow no-op (onConflictDoNothing returns nothing)', async () => {
    findFirstMock.mockResolvedValue({
      id: 'target',
      publicActivityOptIn: true,
      deletedAt: null,
    });
    const tx = mockTx([]);
    transactionMock.mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx));

    await followUser('me', 'target');

    expect(notifyMock).not.toHaveBeenCalled();
  });
});

describe('unfollowUser', () => {
  it('deletes the edge for the (follower, followee) pair', async () => {
    const where = vi.fn(async () => undefined);
    deleteMock.mockReturnValue({ where });

    await unfollowUser('me', 'target');

    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
  });
});
