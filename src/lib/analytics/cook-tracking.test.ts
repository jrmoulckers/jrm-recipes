import { describe, expect, it, vi } from "vitest";

import {
  beginCookSession,
  cookTrackKey,
  endCookSession,
  FIRST_COOK_MARKER,
  markFirstCookStarted,
} from "./cook-tracking";

/** Minimal in-memory Storage stand-in for the pure helpers. */
function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    get size() {
      return map.size;
    },
  };
}

describe("beginCookSession", () => {
  it("marks the first call new and persists the start time", () => {
    const storage = memoryStorage();

    const first = beginCookSession(storage, "rec_1", 1000);

    expect(first).toEqual({ isNew: true, startedAt: 1000 });
    expect(storage.getItem(cookTrackKey("rec_1"))).toBe("1000");
  });

  it("dedupes across reloads: subsequent calls are not new", () => {
    const storage = memoryStorage();

    beginCookSession(storage, "rec_1", 1000);
    const second = beginCookSession(storage, "rec_1", 5000);

    expect(second).toEqual({ isNew: false, startedAt: 1000 });
  });

  it("treats different recipes as independent sessions", () => {
    const storage = memoryStorage();

    expect(beginCookSession(storage, "rec_1", 1000).isNew).toBe(true);
    expect(beginCookSession(storage, "rec_2", 1000).isNew).toBe(true);
  });

  it("always reports new (no dedupe) when storage is unavailable", () => {
    expect(beginCookSession(null, "rec_1", 1000)).toEqual({
      isNew: true,
      startedAt: 1000,
    });
  });

  it("survives a throwing setItem (private mode) and still reports new", () => {
    const storage = {
      getItem: () => null,
      setItem: vi.fn(() => {
        throw new Error("quota");
      }),
      removeItem: vi.fn(),
    };

    expect(beginCookSession(storage, "rec_1", 1000).isNew).toBe(true);
  });
});

describe("endCookSession", () => {
  it("returns the elapsed duration and clears the marker", () => {
    const storage = memoryStorage();
    beginCookSession(storage, "rec_1", 1000);

    const { durationMs } = endCookSession(storage, "rec_1", 4000);

    expect(durationMs).toBe(3000);
    expect(storage.getItem(cookTrackKey("rec_1"))).toBeNull();
  });

  it("never returns a negative duration", () => {
    const storage = memoryStorage();
    beginCookSession(storage, "rec_1", 5000);

    expect(endCookSession(storage, "rec_1", 1000).durationMs).toBe(0);
  });

  it("returns zero duration when there was no session", () => {
    const storage = memoryStorage();

    expect(endCookSession(storage, "rec_1", 4000).durationMs).toBe(0);
  });
});

describe("markFirstCookStarted", () => {
  it("reports the first ever cook and persists the marker", () => {
    const storage = memoryStorage();

    expect(markFirstCookStarted(storage, 1000)).toEqual({ isFirstEver: true });
    expect(storage.getItem(FIRST_COOK_MARKER)).toBe("1000");
  });

  it("reports false on every subsequent cook (no double counting)", () => {
    const storage = memoryStorage();

    markFirstCookStarted(storage, 1000);

    expect(markFirstCookStarted(storage, 2000).isFirstEver).toBe(false);
    expect(markFirstCookStarted(storage, 3000).isFirstEver).toBe(false);
    // Marker keeps the original timestamp.
    expect(storage.getItem(FIRST_COOK_MARKER)).toBe("1000");
  });

  it("is device-global: a second recipe is not a first cook", () => {
    const storage = memoryStorage();

    beginCookSession(storage, "rec_1", 1000);
    expect(markFirstCookStarted(storage, 1000).isFirstEver).toBe(true);

    beginCookSession(storage, "rec_2", 2000);
    expect(markFirstCookStarted(storage, 2000).isFirstEver).toBe(false);
  });

  it("does not claim a first cook when storage is unavailable", () => {
    expect(markFirstCookStarted(null)).toEqual({ isFirstEver: false });
  });

  it("does not claim a first cook when the read throws (private mode)", () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error("blocked");
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    expect(markFirstCookStarted(storage).isFirstEver).toBe(false);
  });
});
