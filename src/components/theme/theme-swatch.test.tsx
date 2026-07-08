import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ThemeSwatch } from "./theme-swatch";
import { ThemeProvider } from "~/components/theme/theme-provider";
import type { ColorScheme, UITheme } from "~/config/themes";

// ThemeProvider reads matchMedia to resolve the "system" scheme.
beforeAll(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

afterEach(cleanup);

function renderSwatch(
  ui: ReactElement,
  { theme = "kitchen", scheme = "light" }: { theme?: UITheme; scheme?: ColorScheme } = {},
) {
  return render(
    <ThemeProvider initialTheme={theme} initialScheme={scheme}>
      {ui}
    </ThemeProvider>,
  );
}

describe("ThemeSwatch", () => {
  it("re-scopes tokens by setting data-theme on its own wrapper", () => {
    const { container } = renderSwatch(<ThemeSwatch theme="whimsy" />);
    const wrapper = container.querySelector('[data-theme="whimsy"]');
    expect(wrapper).not.toBeNull();
    expect(wrapper).toHaveAttribute("aria-hidden", "true");
  });

  it("renders the primary/secondary/accent tokens as the three dots", () => {
    const { container } = renderSwatch(<ThemeSwatch theme="kitchen" />);
    const wrapper = container.querySelector('[data-theme="kitchen"]')!;
    const dots = wrapper.querySelectorAll("span");
    expect(dots).toHaveLength(3);
    expect(dots[0]!.className).toContain("bg-primary");
    expect(dots[1]!.className).toContain("bg-secondary");
    expect(dots[2]!.className).toContain("bg-accent");
  });

  it("uses zero hex literals — colors come from tokens only", () => {
    const { container } = renderSwatch(<ThemeSwatch theme="professional" />);
    const wrapper = container.querySelector('[data-theme="professional"]')!;
    expect(wrapper.outerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}/);
    expect(wrapper.outerHTML).not.toContain("style=");
  });

  it("adds the dark class when the active scheme is dark", () => {
    const { container } = renderSwatch(<ThemeSwatch theme="kids" />, {
      scheme: "dark",
    });
    const wrapper = container.querySelector('[data-theme="kids"]')!;
    expect(wrapper.className).toContain("dark");
  });

  it("omits the dark class in a light scheme", () => {
    const { container } = renderSwatch(<ThemeSwatch theme="kids" />, {
      scheme: "light",
    });
    const wrapper = container.querySelector('[data-theme="kids"]')!;
    expect(wrapper.className).not.toContain("dark");
  });

  it("lets an explicit scheme prop override the active scheme", () => {
    const { container } = renderSwatch(<ThemeSwatch theme="barebones" scheme="dark" />, {
      scheme: "light",
    });
    const wrapper = container.querySelector('[data-theme="barebones"]')!;
    expect(wrapper.className).toContain("dark");
  });

  it("scales the dots for the large size", () => {
    const { container } = renderSwatch(<ThemeSwatch theme="kitchen" size="lg" />);
    const wrapper = container.querySelector('[data-theme="kitchen"]')!;
    const dot = wrapper.querySelector("span")!;
    expect(dot.className).toContain("size-8");
  });
});
