import { describe, expect, it } from "vitest";

import { scrubProperties } from "./scrub";

describe("scrubProperties", () => {
  it("returns undefined for empty input", () => {
    expect(scrubProperties(undefined)).toBeUndefined();
    expect(scrubProperties(null)).toBeUndefined();
  });

  it("keeps safe, non-identifying properties untouched", () => {
    expect(
      scrubProperties({
        recipeId: "rec_123",
        stepCount: 7,
        hasPhoto: true,
        visibility: "group",
      }),
    ).toEqual({
      recipeId: "rec_123",
      stepCount: 7,
      hasPhoto: true,
      visibility: "group",
    });
  });

  it("drops keys that look like PII", () => {
    const out = scrubProperties({
      recipeId: "rec_1",
      email: "nonna@example.com",
      firstName: "Nonna",
      lastName: "Rossi",
      userHandle: "nonna",
      phoneNumber: "+1 555 123 4567",
      password: "hunter2",
      token: "abc",
    });
    expect(out).toEqual({ recipeId: "rec_1" });
  });

  it("redacts email/phone values even under a safe-looking key", () => {
    expect(
      scrubProperties({ note: "reach me at nonna@example.com" }),
    ).toEqual({ note: "[redacted]" });
    expect(scrubProperties({ ref: "call 555-123-4567 now" })).toEqual({
      ref: "[redacted]",
    });
  });

  it("scrubs nested objects and arrays", () => {
    expect(
      scrubProperties({
        group: { groupId: "g_1", email: "a@b.com" },
        tags: ["ok", "me@b.com"],
      }),
    ).toEqual({
      group: { groupId: "g_1" },
      tags: ["ok", "[redacted]"],
    });
  });

  it("does not drop PostHog's reserved feature-flag response key", () => {
    expect(
      scrubProperties({
        $feature_flag: "empty_state_cta",
        $feature_flag_response: "benefit_led",
      }),
    ).toEqual({
      $feature_flag: "empty_state_cta",
      $feature_flag_response: "benefit_led",
    });
  });
});
