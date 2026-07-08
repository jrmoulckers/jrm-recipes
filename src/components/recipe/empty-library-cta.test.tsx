import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FlagsProvider } from "~/components/analytics/flags-provider";
import { type FlagMap } from "~/lib/analytics/flags";
import {
  EmptyLibraryCta,
  EMPTY_LIBRARY_CTA_FLAG,
  emptyLibraryCopy,
} from "./empty-library-cta";

const track = vi.hoisted(() => vi.fn());

// The CTA and the flags provider both dispatch through the typed client; stub it
// so we can assert the exposure event without a real backend.
vi.mock("~/lib/analytics", () => ({ track }));

afterEach(() => {
  cleanup();
  track.mockReset();
});

function renderWithFlag(value?: string) {
  const initialFlags: FlagMap = value ? { [EMPTY_LIBRARY_CTA_FLAG]: value } : {};
  return render(
    <FlagsProvider initialFlags={initialFlags}>
      <EmptyLibraryCta />
    </FlagsProvider>,
  );
}

describe("emptyLibraryCopy", () => {
  it("falls back to control for unknown / boolean flag values", () => {
    expect(emptyLibraryCopy("control").heading).toBe("No recipes yet");
    expect(emptyLibraryCopy(false).heading).toBe("No recipes yet");
    expect(emptyLibraryCopy("does-not-exist").heading).toBe("No recipes yet");
  });

  it("maps known variants to their copy", () => {
    expect(emptyLibraryCopy("benefit").heading).toBe(
      "Save your family's first recipe",
    );
  });
});

describe("<EmptyLibraryCta />", () => {
  it("renders the control copy when the flag is unset (all control)", () => {
    renderWithFlag();
    expect(screen.getByText("No recipes yet")).toBeTruthy();
  });

  it("renders the benefit variant when the flag is seeded", () => {
    renderWithFlag("benefit");
    expect(screen.getByText("Save your family's first recipe")).toBeTruthy();
  });

  it("records a single $feature_flag_called exposure with the variant", () => {
    renderWithFlag("benefit");
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("$feature_flag_called", {
      $feature_flag: EMPTY_LIBRARY_CTA_FLAG,
      $feature_flag_response: "benefit",
    });
  });
});
