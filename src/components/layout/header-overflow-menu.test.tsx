import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IntlWrapper } from "~/test/intl";

// The hosted controls are self-contained client components with their own
// provider dependencies; stub them so this test focuses on the overflow
// menu's own behaviour (trigger, labelling, and collapse).
vi.mock("~/components/theme/theme-switcher", () => ({
  ThemeSwitcher: () => <button type="button">theme</button>,
}));
vi.mock("~/components/theme/kids-mode-toggle", () => ({
  KidsModeToggle: () => <button type="button">kids</button>,
}));
vi.mock("~/components/i18n/locale-switcher", () => ({
  LocaleSwitcher: () => <button type="button">locale</button>,
}));
vi.mock("~/components/a11y/accessibility-menu", () => ({
  AccessibilityMenu: () => <button type="button">a11y</button>,
}));
vi.mock("~/components/pwa/offline-storage-menu", () => ({
  OfflineStorageMenu: () => <button type="button">offline</button>,
}));

import { HeaderOverflowMenu } from "./header-overflow-menu";

afterEach(cleanup);

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

  it("reveals the secondary controls with visible labels when opened", async () => {
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
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
