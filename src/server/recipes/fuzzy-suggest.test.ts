import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    execute: vi.fn(),
    query: { groupMembers: { findMany: vi.fn() } },
  },
}));

vi.mock("~/server/db", () => ({
  db: dbMock,
  isDbConfigured: () => true,
}));

import { suggestSearchTerm } from "./queries";

describe("suggestSearchTerm (did-you-mean, #269)", () => {
  beforeEach(() => {
    dbMock.execute.mockReset();
  });

  it("returns the closest trigram match for a misspelled query", async () => {
    dbMock.execute.mockResolvedValue([{ term: "Banana Bread", sim: 0.62 }]);
    await expect(suggestSearchTerm(null, "banan bread")).resolves.toBe(
      "Banana Bread",
    );
    expect(dbMock.execute).toHaveBeenCalledTimes(1);
  });

  it("returns null when no candidate clears the similarity threshold", async () => {
    dbMock.execute.mockResolvedValue([]);
    await expect(suggestSearchTerm(null, "zzzznope")).resolves.toBeNull();
  });

  it("does not suggest the query back to itself", async () => {
    dbMock.execute.mockResolvedValue([{ term: "chicken", sim: 1 }]);
    await expect(suggestSearchTerm(null, "Chicken")).resolves.toBeNull();
  });

  it("skips very short queries without hitting the database", async () => {
    await expect(suggestSearchTerm(null, "ab")).resolves.toBeNull();
    expect(dbMock.execute).not.toHaveBeenCalled();
  });

  it("degrades silently when pg_trgm is unavailable", async () => {
    dbMock.execute.mockRejectedValue(
      new Error("function similarity(text, text) does not exist"),
    );
    await expect(suggestSearchTerm(null, "chicekn")).resolves.toBeNull();
  });
});
