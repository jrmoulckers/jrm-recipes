import { cleanup, render as rtlRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// PrivacyToggle pulls in the ConsentProvider (analytics backend side effects);
// stub it so this test stays focused on the accessibility panel's own wiring.
vi.mock("~/components/privacy/privacy-toggle", () => ({
  PrivacyToggle: () => null,
}));

import { AccessibilityMenu } from "./accessibility-menu";
import { A11yProvider } from "./a11y-provider";
import type { A11yPrefs } from "~/config/a11y";
import { ThemeProvider } from "~/components/theme/theme-provider";
import { IntlWrapper } from "~/test/intl";
import enMessages from "~/messages/en.json";
import esMessages from "~/messages/es.json";
import type { ReactElement } from "react";

function mockMatchMedia() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function renderMenu(opts: {
  initialPrefs?: A11yPrefs;
  locale?: "en" | "es";
  messages?: typeof enMessages;
} = {}) {
  const ui: ReactElement = (
    <ThemeProvider>
      <A11yProvider initialPrefs={opts.initialPrefs}>
        <AccessibilityMenu />
      </A11yProvider>
    </ThemeProvider>
  );
  return rtlRender(
    <IntlWrapper locale={opts.locale ?? "en"} messages={opts.messages}>
      {ui}
    </IntlWrapper>,
  );
}

beforeEach(() => {
  localStorage.clear();
  mockMatchMedia();
});

afterEach(cleanup);

describe("AccessibilityMenu localization (i18n convention)", () => {
  it("labels the trigger and announces the active state when a pref is set", () => {
    renderMenu({ initialPrefs: { textSize: "large", reading: false } });

    // Active state is conveyed in the accessible name, not by color alone.
    expect(
      screen.getByRole("button", {
        name: enMessages.accessibilityMenu.triggerActive,
      }),
    ).toBeInTheDocument();
  });

  it("uses the neutral trigger name when no preference is set", () => {
    renderMenu();
    expect(
      screen.getByRole("button", {
        name: enMessages.accessibilityMenu.trigger,
      }),
    ).toBeInTheDocument();
  });

  it("renders every panel control from the catalog, not hardcoded English", async () => {
    const user = userEvent.setup();
    renderMenu({ locale: "es", messages: esMessages });

    await user.click(
      screen.getByRole("button", {
        name: esMessages.accessibilityMenu.trigger,
      }),
    );

    // Dialog title + toggle names come from the Spanish catalog.
    expect(
      screen.getByRole("heading", {
        name: esMessages.accessibilityMenu.title,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", {
        name: esMessages.accessibilityMenu.contrast.title,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", {
        name: esMessages.accessibilityMenu.motion.title,
      }),
    ).toBeInTheDocument();
  });
});

describe("AccessibilityMenu a11y wiring", () => {
  it("names each switch by its title only and links the description (WCAG 4.1.2)", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(
      screen.getByRole("button", {
        name: enMessages.accessibilityMenu.trigger,
      }),
    );

    const contrast = screen.getByRole("switch", {
      name: enMessages.accessibilityMenu.contrast.title,
    });
    // The long description is supplementary, not part of the accessible name.
    expect(contrast).toHaveAccessibleName(
      enMessages.accessibilityMenu.contrast.title,
    );
    expect(contrast).toHaveAccessibleDescription(
      enMessages.accessibilityMenu.contrast.description,
    );
  });

  it("gives each text-size option an explicit, unambiguous name", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(
      screen.getByRole("button", {
        name: enMessages.accessibilityMenu.trigger,
      }),
    );

    const defaultOption = screen.getByRole("button", {
      name: "Default text size",
    });
    expect(defaultOption).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Larger text size" }),
    ).toHaveAttribute("aria-pressed", "false");
  });
});
