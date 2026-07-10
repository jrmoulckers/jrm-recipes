import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";

import { CharacterCounter } from "~/components/ui/character-counter";
import { IntlWrapper } from "~/test/intl";

const OVER = "Keep comments under 4,000 characters";

function renderCounter(ui: ReactElement) {
  return render(<IntlWrapper>{ui}</IntlWrapper>);
}

describe("<CharacterCounter />", () => {
  it("stays quiet well under the limit", () => {
    renderCounter(
      <CharacterCounter value={10} max={4000} overMessage={OVER} />,
    );
    expect(screen.queryByText(/left/)).toBeNull();
  });

  it("shows remaining near the limit", () => {
    renderCounter(
      <CharacterCounter value={3900} max={4000} overMessage={OVER} />,
    );
    expect(screen.getByText("100 left")).toBeTruthy();
  });

  it("shows the over count with the validation message when exceeded", () => {
    renderCounter(
      <CharacterCounter value={4015} max={4000} overMessage={OVER} />,
    );
    expect(screen.getByText(`Over by 15 — ${OVER}`)).toBeTruthy();
  });

  it("announces politely to assistive tech", () => {
    const { container } = renderCounter(
      <CharacterCounter value={3999} max={4000} overMessage={OVER} />,
    );
    expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
  });
});
