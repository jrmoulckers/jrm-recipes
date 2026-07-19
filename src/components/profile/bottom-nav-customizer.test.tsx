import * as React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";

import { IntlWrapper } from "~/test/intl";
import { DEFAULT_MOBILE_PINNED, MAX_PINNED } from "~/config/nav";
import { useBottomNavStore } from "~/lib/bottom-nav-store";
import { BottomNavCustomizer } from "./bottom-nav-customizer";

function reset() {
  useBottomNavStore.setState({ pinned: [...DEFAULT_MOBILE_PINNED] });
}

function openDialog() {
  render(
    <IntlWrapper>
      <BottomNavCustomizer />
    </IntlWrapper>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Customize tabs" }));
  return screen.getByRole("dialog");
}

beforeEach(reset);
afterEach(cleanup);

describe("BottomNavCustomizer", () => {
  it("lists pinned tabs with keyboard-operable reorder controls", () => {
    const dialog = openDialog();
    // Each default pinned tab exposes explicit Move up/down buttons (not
    // drag-only), keeping reorder accessible.
    expect(
      within(dialog).getByRole("button", { name: "Move Recipes earlier" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Move Recipes later" }),
    ).toBeInTheDocument();
  });

  it("moves a tab later and updates the store order", () => {
    const dialog = openDialog();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Move Home later" }),
    );
    expect(useBottomNavStore.getState().pinned).toEqual([
      "recipes",
      "home",
      "plan",
      "shopping",
    ]);
  });

  it("removes and adds tabs", () => {
    const dialog = openDialog();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove Plan" }),
    );
    expect(useBottomNavStore.getState().pinned).not.toContain("plan");

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Add Discover" }),
    );
    expect(useBottomNavStore.getState().pinned).toContain("discover");
  });

  it("disables adding once the pin cap is reached", () => {
    const dialog = openDialog();
    // Defaults already fill the cap.
    expect(useBottomNavStore.getState().pinned).toHaveLength(MAX_PINNED);
    const addDiscover = within(dialog).getByRole("button", {
      name: "Add Discover",
    });
    expect(addDiscover).toBeDisabled();
  });

  it("announces changes through a live region", () => {
    const dialog = openDialog();
    const status = within(dialog).getByRole("status");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove Plan" }),
    );
    expect(status).toHaveTextContent("Plan removed from tabs.");
  });

  it("resets to defaults", () => {
    const dialog = openDialog();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove Plan" }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Reset to defaults" }),
    );
    expect(useBottomNavStore.getState().pinned).toEqual(DEFAULT_MOBILE_PINNED);
  });
});
