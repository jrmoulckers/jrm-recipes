import { cleanup, render as rtlRender, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReadAloudButton } from "./read-aloud-button";
import { useReadAloud } from "~/lib/use-read-aloud";
import type { ReactElement } from "react";
import { IntlWrapper } from "~/test/intl";

vi.mock("~/lib/use-read-aloud", () => ({
  useReadAloud: vi.fn(),
}));

const mockedUseReadAloud = vi.mocked(useReadAloud);

const controls = {
  supported: true,
  status: "idle" as const,
  index: -1,
  play: vi.fn(),
  pause: vi.fn(),
  stop: vi.fn(),
  replay: vi.fn(),
  next: vi.fn(),
  previous: vi.fn(),
};

function render(ui: ReactElement) {
  return rtlRender(<IntlWrapper>{ui}</IntlWrapper>);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReadAloudButton theme states (#598)", () => {
  it("uses the neutral secondary-action treatment before reading starts", () => {
    mockedUseReadAloud.mockReturnValue(controls);

    render(
      <ReadAloudButton
        steps={["Whisk the ingredients."]}
        anchorPrefix="recipe-step-"
      />,
    );

    expect(
      screen.getByRole("button", { name: /read this to me/i }),
    ).toHaveAttribute("data-variant", "outline");
  });

  it("uses the primary brand treatment while reading is active", () => {
    mockedUseReadAloud.mockReturnValue({
      ...controls,
      status: "playing",
    });

    render(
      <ReadAloudButton
        steps={["Whisk the ingredients."]}
        anchorPrefix="recipe-step-"
      />,
    );

    expect(screen.getByRole("button", { name: /pause/i })).toHaveAttribute(
      "data-variant",
      "default",
    );
  });
});
