import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_UNIT_PREFS } from "~/lib/units";
import { useShoppingStore } from "~/lib/shopping-store";
import { IntlWrapper } from "~/test/intl";
import { ConfirmProvider } from "~/components/ui/confirm-dialog";
import {
  UnitPreferencesManager,
  type UnitPreferencesView,
} from "./unit-preferences-manager";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  savePreferences: vi.fn().mockResolvedValue({ ok: true, id: "prefs" }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("~/server/units/actions", () => ({
  saveUnitPreferencesAction: mocks.savePreferences,
  createCustomUnitAction: vi.fn(),
  updateCustomUnitAction: vi.fn(),
  deleteCustomUnitAction: vi.fn(),
}));

const preferences: UnitPreferencesView = {
  defaultSystem: DEFAULT_UNIT_PREFS.defaultSystem,
  volumeUnit: null,
  liquidVolumeUnit: null,
  dryVolumeUnit: null,
  smallVolumeUnit: null,
  massUnit: null,
  temperatureUnit: null,
  autoConvert: DEFAULT_UNIT_PREFS.autoConvert,
  packageRounding: false,
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlWrapper>
      <ConfirmProvider>{children}</ConfirmProvider>
    </IntlWrapper>
  );
}

beforeEach(() => {
  mocks.refresh.mockClear();
  mocks.savePreferences.mockClear();
  useShoppingStore.setState({
    unitPreferences: { ...DEFAULT_UNIT_PREFS },
    customUnits: [],
    packageRounding: false,
  });
});

afterEach(cleanup);

describe("UnitPreferencesManager package rounding", () => {
  it("stores the off-by-default preference locally when offline", () => {
    render(
      <UnitPreferencesManager preferences={null} customUnits={[]} offline />,
      { wrapper: Wrapper },
    );

    const control = screen.getByRole("switch", {
      name: "Round shopping quantities up to saved package sizes",
    });
    expect(control).not.toBeChecked();

    fireEvent.click(control);

    expect(useShoppingStore.getState().packageRounding).toBe(true);
    expect(
      screen.getByText(
        "These preferences and custom units are saved in this browser while database sync is unavailable.",
      ),
    ).toHaveAttribute("role", "status");
  });

  it("saves the global setting through the existing preference action", async () => {
    render(
      <UnitPreferencesManager preferences={preferences} customUnits={[]} />,
      { wrapper: Wrapper },
    );

    fireEvent.click(
      screen.getByRole("switch", {
        name: "Round shopping quantities up to saved package sizes",
      }),
    );

    await waitFor(() =>
      expect(mocks.savePreferences).toHaveBeenCalledWith(
        expect.objectContaining({ packageRounding: true }),
      ),
    );
  });
});
