import { beforeEach, describe, expect, it, vi } from 'vitest';

const { state, eraseUserAccount, deleteClerkUser, log, db } = vi.hoisted(() => {
  const state = { holds: [] as Record<string, unknown>[] };
  const chain = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(async () => state.holds),
  };
  return {
    state,
    eraseUserAccount: vi.fn(async () => ({ status: 'erased' as const })),
    deleteClerkUser: vi.fn(async () => undefined),
    log: { error: vi.fn() },
    db: { select: vi.fn(() => chain) },
  };
});

vi.mock('~/server/db', () => ({ db }));
vi.mock('~/lib/log', () => ({ log }));
vi.mock('~/server/users/erasure', () => ({ eraseUserAccount }));
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(async () => ({ users: { deleteUser: deleteClerkUser } })),
}));

import { replayOpenErasureHolds } from './erasure-replay';

beforeEach(() => {
  state.holds = [];
  vi.clearAllMocks();
});

describe('replayOpenErasureHolds', () => {
  it('replays locally before Clerk cleanup and preserves hold evidence', async () => {
    const firstRequestedAt = new Date('2026-08-01T12:00:00.000Z');
    state.holds = [
      {
        userId: 'u1',
        clerkId: 'clerk_1',
        trigger: 'in_app',
        noticeVersion: 'delete-v1',
        firstRequestedAt,
        requestCount: 3,
      },
    ];

    expect(await replayOpenErasureHolds()).toEqual({ attempted: 1, erased: 1, failed: 0 });
    expect(deleteClerkUser).toHaveBeenCalledWith('clerk_1');
    expect(eraseUserAccount.mock.invocationCallOrder[0]).toBeLessThan(
      deleteClerkUser.mock.invocationCallOrder[0]!,
    );
    expect(eraseUserAccount).toHaveBeenCalledWith('u1', {
      trigger: 'in_app',
      noticeVersion: 'delete-v1',
      requestedAt: firstRequestedAt,
      requestCount: 3,
    });
  });

  it('does not call Clerk again for a hold created by its deletion webhook', async () => {
    state.holds = [
      {
        userId: 'u1',
        clerkId: 'clerk_1',
        trigger: 'clerk_webhook',
        noticeVersion: null,
      },
    ];

    await replayOpenErasureHolds();
    expect(deleteClerkUser).not.toHaveBeenCalled();
    expect(eraseUserAccount).toHaveBeenCalledOnce();
  });

  it('reports failures without logging subject identifiers', async () => {
    state.holds = [
      {
        userId: 'private-user-id',
        clerkId: null,
        trigger: 'dsr_request',
        noticeVersion: null,
      },
    ];
    eraseUserAccount.mockRejectedValueOnce(new Error('private payload'));

    expect(await replayOpenErasureHolds()).toEqual({ attempted: 1, erased: 0, failed: 1 });
    expect(log.error).toHaveBeenCalledWith('erasure.replay_failed', {
      trigger: 'dsr_request',
    });
  });
});
