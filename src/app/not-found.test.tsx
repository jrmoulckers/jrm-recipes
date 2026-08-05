import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Resolve `getTranslations` against the real *Spanish* catalog.
 *
 * Asserting in Spanish is deliberate. An English assertion would still pass if
 * the page fell back to hardcoded strings, which is exactly the regression this
 * file exists to catch.
 */
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const messages = (await import("~/messages/es.json")).default;
  return {
    getLocale: () => Promise.resolve("es"),
    getTranslations: (namespace: string) =>
      Promise.resolve(
        createTranslator({
          locale: "es",
          messages,
          // The mock takes the namespace as a plain string, so it has to be
          // widened past next-intl's generated union of catalog namespaces.
          namespace: namespace as never,
        }),
      ),
  };
});

import NotFound from "./not-found";

afterEach(cleanup);

async function renderNotFound() {
  render(await NotFound());
}

describe("app not-found page", () => {
  it("links to both Home and Recipes", async () => {
    await renderNotFound();

    expect(screen.getByRole("link", { name: /inicio/i })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: /ver recetas/i })).toHaveAttribute(
      "href",
      "/recipes",
    );
  });

  it("shows a friendly 404 heading", async () => {
    await renderNotFound();

    expect(screen.getByText("404")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /no encontramos esa p/i }),
    ).toBeInTheDocument();
  });
});
