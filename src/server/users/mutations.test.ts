import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeUser } from "~/test/factories";
import { useDbMock, type DbMock } from "~/test/harness";

vi.mock("server-only", () => ({}));
vi.mock("~/server/db", async () =>
  (await import("~/test/harness")).dbModuleMock(),
);

import { avatarInput, updateAvatar } from "./mutations";

/**
 * Profile avatar writes (issue #659). Two things matter here: the write is
 * scoped to the signed-in user's own row, and `avatarUserManaged` tracks whether
 * Heirloom or Clerk owns the column.
 */
describe("avatarInput", () => {
  it("accepts an allowed media host", () => {
    const parsed = avatarInput.parse({
      url: "https://res.cloudinary.com/demo/image/upload/a.jpg",
    });
    expect(parsed.url).toBe(
      "https://res.cloudinary.com/demo/image/upload/a.jpg",
    );
  });

  it("rejects a URL from a host outside the media allowlist", () => {
    expect(() =>
      avatarInput.parse({ url: "https://evil.example.com/a.jpg" }),
    ).toThrow();
  });

  it("treats an empty string as clearing the photo", () => {
    expect(avatarInput.parse({ url: "" }).url).toBeUndefined();
  });
});

describe("updateAvatar", () => {
  let db: DbMock;
  let assigned: Record<string, unknown> | undefined;

  beforeEach(() => {
    db = useDbMock();
    assigned = undefined;
    db.update.mockImplementation(() => ({
      set: (vals?: unknown) => {
        assigned = vals as Record<string, unknown>;
        return { where: () => Promise.resolve(undefined) };
      },
    }));
  });

  it("stores the photo and marks the avatar user-managed", async () => {
    const url = "https://res.cloudinary.com/demo/image/upload/me.jpg";

    const result = await updateAvatar({ url }, makeUser({ id: "user_9" }));

    expect(result).toEqual({ avatarUrl: url });
    expect(assigned).toEqual({ avatarUrl: url, avatarUserManaged: true });
  });

  it("hands the column back to Clerk when the photo is cleared", async () => {
    const result = await updateAvatar({}, makeUser({ id: "user_9" }));

    expect(result).toEqual({ avatarUrl: null });
    expect(assigned).toEqual({ avatarUrl: null, avatarUserManaged: false });
  });
});
