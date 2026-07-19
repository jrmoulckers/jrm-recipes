import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_MOBILE_PINNED, MAX_PINNED } from "~/config/nav";
import { useBottomNavStore } from "~/lib/bottom-nav-store";

function reset() {
  useBottomNavStore.setState({ pinned: [...DEFAULT_MOBILE_PINNED] });
}

describe("bottom-nav store", () => {
  beforeEach(reset);

  it("defaults to the out-of-the-box pinned tabs", () => {
    expect(useBottomNavStore.getState().pinned).toEqual(DEFAULT_MOBILE_PINNED);
  });

  it("pins and unpins destinations", () => {
    useBottomNavStore.getState().unpin("plan");
    expect(useBottomNavStore.getState().pinned).not.toContain("plan");

    useBottomNavStore.getState().pin("discover");
    expect(useBottomNavStore.getState().pinned).toContain("discover");
  });

  it("does not exceed the pin cap", () => {
    // Start from a full default set (4) and try to add a 5th.
    expect(useBottomNavStore.getState().pinned).toHaveLength(MAX_PINNED);
    useBottomNavStore.getState().pin("discover");
    expect(useBottomNavStore.getState().pinned).toHaveLength(MAX_PINNED);
    expect(useBottomNavStore.getState().pinned).not.toContain("discover");
  });

  it("ignores pinning an unpinnable key", () => {
    useBottomNavStore.getState().unpin("plan");
    // "create" is intentionally not pinnable.
    useBottomNavStore.getState().pin("create");
    expect(useBottomNavStore.getState().pinned).not.toContain("create");
  });

  it("toggles pinned state", () => {
    useBottomNavStore.getState().toggle("home");
    expect(useBottomNavStore.getState().pinned).not.toContain("home");
    useBottomNavStore.getState().toggle("home");
    expect(useBottomNavStore.getState().pinned).toContain("home");
  });

  it("reorders with moveUp / moveDown", () => {
    // defaults: [home, recipes, plan, shopping]
    useBottomNavStore.getState().moveUp("plan");
    expect(useBottomNavStore.getState().pinned).toEqual([
      "home",
      "plan",
      "recipes",
      "shopping",
    ]);

    useBottomNavStore.getState().moveDown("home");
    expect(useBottomNavStore.getState().pinned).toEqual([
      "plan",
      "home",
      "recipes",
      "shopping",
    ]);
  });

  it("clamps moves at the ends", () => {
    const before = useBottomNavStore.getState().pinned;
    useBottomNavStore.getState().moveUp("home");
    expect(useBottomNavStore.getState().pinned).toEqual(before);
    useBottomNavStore.getState().moveDown("shopping");
    expect(useBottomNavStore.getState().pinned).toEqual(before);
  });

  it("resets to defaults", () => {
    useBottomNavStore.getState().unpin("plan");
    useBottomNavStore.getState().unpin("home");
    useBottomNavStore.getState().reset();
    expect(useBottomNavStore.getState().pinned).toEqual(DEFAULT_MOBILE_PINNED);
  });
});
