import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IntlWrapper } from "~/test/intl";

// Spies let us assert that clicking anywhere on a row (the whole labeled
// button) activates the hosted control.
const clicks = vi.hoisted(() => ({
  appearance: vi.fn(),
  kids: vi.fn(),
  locale: vi.fn(),
  a11y: vi.fn(),
  offline: vi.fn(),
}));

// The hosted controls are self-contained client components with their own
// provider dependencies; stub them so this test focuses on the overflow
// menu's own behaviour (trigger, labelling, and collapse). Each stub mirrors
// the real contract: a single full-width button whose accessible name is the
// passed `label`.
vi.mock("~/components/theme/theme-switcher", () => ({
  ThemeSwitcher: ({ label }: { label?: string }) => (
    <button type="button" onClick={clicks.appearance}>
      {label}
    </button>
  ),
}));
vi.mock("~/components/theme/kids-mode-toggle", () => ({
  KidsModeToggle: ({ label }: { label?: string }) => (
    <button type="button" onClick={clicks.kids}>
      {label}
    </button>
  ),
}));
vi.mock("~/components/i18n/locale-switcher", () => ({
  LocaleSwitcher: ({ label }: { label?: string }) => (
    <button type="button" onClick={clicks.locale}>
      {label}
    </button>
  ),
}));
vi.mock("~/components/a11y/accessibility-menu", () => ({
  AccessibilityMenu: ({ label }: { label?: string }) => (
    <button type="button" onClick={clicks.a11y}>
      {label}
    </button>
  ),
}));
vi.mock("~/components/pwa/offline-storage-menu", () => ({
  OfflineStorageMenu: ({ label }: { label?: string }) => (
    <button type="button" onClick={clicks.offline}>
      {label}
    </button>
  ),
}));

import { HeaderOverflowMenu } from "./header-overflow-menu";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderMenu() {
  return render(
    <IntlWrapper>
      <HeaderOverflowMenu />
    </IntlWrapper>,
  );
}

describe("HeaderOverflowMenu", () => {
  it("exposes an accessibly named trigger and keeps controls collapsed by default", () => {
    renderMenu();

    expect(
      screen.getByRole("button", { name: "More options" }),
    ).toBeInTheDocument();
    // Secondary controls are not in the DOM until the menu is opened.
    expect(screen.queryByText("Appearance")).not.toBeInTheDocument();
  });

  it("reveals each secondary control as a single full-width labeled button", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "More options" }));

    for (const label of [
      "Appearance",
      "Kids mode",
      "Language",
      "Accessibility",
      "Offline storage",
    ]) {
      // Each row is a single interactive element whose accessible name is the
      // visible label — no separate, non-clickable label text alongside it.
      const control = screen.getByRole("button", { name: label });
      const row = control.closest("li");
      expect(row).not.toBeNull();
      expect(row?.querySelectorAll("button")).toHaveLength(1);
    }
  });

  it("activates the control when the labeled row is clicked", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.click(screen.getByRole("button", { name: "Appearance" }));
    expect(clicks.appearance).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Offline storage" }));
    expect(clicks.offline).toHaveBeenCalledTimes(1);
  });
});
