import { cleanup, render as rtlRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as React from "react";

import { LocaleSwitcher } from "./locale-switcher";
import { IntlWrapper } from "~/test/intl";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

// Radix DropdownMenu leans on browser APIs jsdom lacks.
beforeAll(() => {
  const proto = window.HTMLElement.prototype;
  proto.scrollIntoView = vi.fn();
  proto.hasPointerCapture = vi.fn(() => false);
  proto.setPointerCapture = vi.fn();
  proto.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  refresh.mockClear();
  document.cookie = "NEXT_LOCALE=;path=/;max-age=0";
});

function render() {
  return rtlRender(
    <IntlWrapper>
      <LocaleSwitcher />
    </IntlWrapper>,
  );
}

async function openMenu() {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  await user.click(screen.getByRole("button", { name: "Change language" }));
  return user;
}

describe("LocaleSwitcher", () => {
  it("lists every supported locale by its native endonym, English checked", async () => {
    render();
    await openMenu();

    expect(
      screen.getByRole("menuitemradio", { name: "English" }),
    ).toHaveAttribute("aria-checked", "true");
    for (const endonym of ["Español", "Deutsch", "العربية"]) {
      expect(
        screen.getByRole("menuitemradio", { name: endonym }),
      ).toHaveAttribute("aria-checked", "false");
    }
  });

  it("persists the chosen locale to NEXT_LOCALE and refreshes", async () => {
    render();
    const user = await openMenu();

    await user.click(screen.getByRole("menuitemradio", { name: "Español" }));

    expect(document.cookie).toContain("NEXT_LOCALE=es");
    expect(refresh).toHaveBeenCalled();
  });
});
