import { beforeEach, describe, expect, it, vi } from "vitest";

const { transactionMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: { transaction: transactionMock },
}));

vi.mock("./share-token", () => ({
  generateShareToken: () => "NEW_TOKEN_000000000000000",
}));

import type { User } from "~/server/db/schema";
import { DomainError } from "~/server/errors";
import { setShareLinkState } from "./mutations";

const owner = { id: "owner_1" } as User;

/**
 * Fake tx: `current` is the row returned by the ownership-scoped findFirst
 * (null → non-owner / missing). `update().set(x).returning()` echoes the current
 * row merged with `x`, mirroring an UPDATE ... RETURNING.
 */
function fakeTx(current: Record<string, unknown> | null) {
  let setArg: Record<string, unknown> = {};
  const chain = {
    set: vi.fn((v: Record<string, unknown>) => {
      setArg = v;
      return chain;
    }),
    where: vi.fn(() => chain),
    returning: vi.fn(async () => [{ ...current, ...setArg }]),
    values: vi.fn(() => chain),
  };
  return {
    setArgOf: () => setArg,
    query: {
      recipes: { findFirst: vi.fn(async () => current) },
    },
    update: vi.fn(() => chain),
    insert: vi.fn(() => chain),
  };
}

function runWith(tx: unknown) {
  transactionMock.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
}

beforeEach(() => vi.clearAllMocks());

describe("setShareLinkState (#207)", () => {
  it("disables the link (revoke) without minting a new token", async () => {
    const tx = fakeTx({
      shareToken: "old-token",
      shareLinkEnabled: true,
      shareTokenRotatedAt: null,
    });
    runWith(tx);

    const state = await setShareLinkState("rec_1", owner, { enabled: false });

    expect(state.shareLinkEnabled).toBe(false);
    expect(tx.setArgOf()).toMatchObject({ shareLinkEnabled: false });
    expect(tx.setArgOf().shareToken).toBeUndefined();
  });

  it("rotates the token: old dies, a fresh one is minted", async () => {
    const tx = fakeTx({
      shareToken: "old-token",
      shareLinkEnabled: true,
      shareTokenRotatedAt: null,
    });
    runWith(tx);

    const state = await setShareLinkState("rec_1", owner, { rotate: true });

    expect(state.shareToken).toBe("NEW_TOKEN_000000000000000");
    expect(tx.setArgOf().shareTokenRotatedAt).toBeInstanceOf(Date);
  });

  it("mints a first token when enabling a never-shared recipe", async () => {
    const tx = fakeTx({
      shareToken: null,
      shareLinkEnabled: true,
      shareTokenRotatedAt: null,
    });
    runWith(tx);

    const state = await setShareLinkState("rec_1", owner, { enabled: true });

    expect(state.shareToken).toBe("NEW_TOKEN_000000000000000");
  });

  it("rejects a non-owner (row scoped to authorId → NOT_FOUND)", async () => {
    const tx = fakeTx(null);
    runWith(tx);

    await expect(
      setShareLinkState("rec_1", owner, { enabled: false }),
    ).rejects.toBeInstanceOf(DomainError);
    expect(tx.update).not.toHaveBeenCalled();
  });
});
