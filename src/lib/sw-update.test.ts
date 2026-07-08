import { describe, expect, it } from "vitest";

import { SKIP_WAITING_MESSAGE, shouldShowUpdatePrompt } from "./sw-update";

describe("SKIP_WAITING_MESSAGE", () => {
  it("matches the payload Serwist listens for", () => {
    expect(SKIP_WAITING_MESSAGE).toEqual({ type: "SKIP_WAITING" });
  });
});

describe("shouldShowUpdatePrompt", () => {
  it("prompts when a page is controlled and a newer worker waits", () => {
    expect(
      shouldShowUpdatePrompt({ hasController: true, hasWaitingWorker: true }),
    ).toBe(true);
  });

  it("does not prompt on the first install (no controller yet)", () => {
    expect(
      shouldShowUpdatePrompt({ hasController: false, hasWaitingWorker: true }),
    ).toBe(false);
  });

  it("does not prompt when nothing is waiting", () => {
    expect(
      shouldShowUpdatePrompt({ hasController: true, hasWaitingWorker: false }),
    ).toBe(false);
    expect(
      shouldShowUpdatePrompt({ hasController: false, hasWaitingWorker: false }),
    ).toBe(false);
  });
});
