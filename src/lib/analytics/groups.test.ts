import { describe, expect, it } from "vitest";

import { groupSizeBucket } from "./groups";

describe("groupSizeBucket", () => {
  it("collapses solo and empty groups into the '1' bucket", () => {
    expect(groupSizeBucket(0)).toBe("1");
    expect(groupSizeBucket(1)).toBe("1");
    // Defensive: negative counts should never happen, but must not throw.
    expect(groupSizeBucket(-3)).toBe("1");
  });

  it("buckets small families as '2-5'", () => {
    expect(groupSizeBucket(2)).toBe("2-5");
    expect(groupSizeBucket(5)).toBe("2-5");
  });

  it("buckets mid-size groups as '6-10'", () => {
    expect(groupSizeBucket(6)).toBe("6-10");
    expect(groupSizeBucket(10)).toBe("6-10");
  });

  it("buckets large groups as '11+'", () => {
    expect(groupSizeBucket(11)).toBe("11+");
    expect(groupSizeBucket(250)).toBe("11+");
  });
});
