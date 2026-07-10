import { describe, expect, it, vi } from "vitest";

import {
  APP_RUNTIME_CACHE_NAMES,
  clearAppCaches,
  estimateOfflineStorage,
  formatBytes,
  requestPersistentStorage,
} from "./offline-storage";

describe("estimateOfflineStorage", () => {
  it("reports usage, quota, and ratio when supported", async () => {
    const manager = {
      estimate: vi.fn().mockResolvedValue({ usage: 25, quota: 100 }),
    };
    const result = await estimateOfflineStorage(manager);
    expect(result).toEqual({
      supported: true,
      usage: 25,
      quota: 100,
      ratio: 0.25,
    });
  });

  it("is unsupported when the API is missing", async () => {
    const result = await estimateOfflineStorage(undefined);
    expect(result.supported).toBe(false);
    expect(result.ratio).toBe(0);
  });

  it("degrades gracefully when estimate throws", async () => {
    const manager = { estimate: vi.fn().mockRejectedValue(new Error("nope")) };
    const result = await estimateOfflineStorage(manager);
    expect(result.supported).toBe(false);
  });

  it("clamps ratio and tolerates a zero quota", async () => {
    const manager = {
      estimate: vi.fn().mockResolvedValue({ usage: 10, quota: 0 }),
    };
    const result = await estimateOfflineStorage(manager);
    expect(result.ratio).toBe(0);
  });
});

describe("clearAppCaches", () => {
  it("deletes each named runtime cache and counts removals", async () => {
    const del = vi.fn(
      async (name: string) => name === APP_RUNTIME_CACHE_NAMES[0],
    );
    const removed = await clearAppCaches({ delete: del });
    expect(del).toHaveBeenCalledTimes(APP_RUNTIME_CACHE_NAMES.length);
    expect(removed).toBe(1);
  });

  it("targets only the recipe page + image caches, not the precache", () => {
    expect(APP_RUNTIME_CACHE_NAMES).toEqual([
      "heirloom-recipes",
      "heirloom-recipe-images",
    ]);
  });

  it("returns 0 when the Cache Storage API is unavailable", async () => {
    expect(await clearAppCaches(undefined)).toBe(0);
  });

  it("swallows per-cache delete errors", async () => {
    const del = vi.fn().mockRejectedValue(new Error("locked"));
    expect(await clearAppCaches({ delete: del })).toBe(0);
  });
});

describe("requestPersistentStorage", () => {
  it("short-circuits when already persisted", async () => {
    const persist = vi.fn();
    const granted = await requestPersistentStorage({
      persisted: vi.fn().mockResolvedValue(true),
      persist,
    });
    expect(granted).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it("requests persistence when not yet persisted", async () => {
    const granted = await requestPersistentStorage({
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockResolvedValue(true),
    });
    expect(granted).toBe(true);
  });

  it("returns false when unsupported or throwing", async () => {
    expect(await requestPersistentStorage(undefined)).toBe(false);
    const granted = await requestPersistentStorage({
      persisted: vi.fn().mockRejectedValue(new Error("x")),
      persist: vi.fn(),
    });
    expect(granted).toBe(false);
  });
});

describe("formatBytes", () => {
  it("formats across units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1_572_864)).toBe("1.5 MB");
    expect(formatBytes(120 * 1024 * 1024)).toBe("120 MB");
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe("3.0 GB");
  });

  it("guards against negative or non-finite input", () => {
    expect(formatBytes(-5)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
  });
});
