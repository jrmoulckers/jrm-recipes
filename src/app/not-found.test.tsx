import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import NotFound from "./not-found";

afterEach(cleanup);

describe("app not-found page", () => {
  it("links to both Home and Recipes", () => {
    render(<NotFound />);

    expect(screen.getByRole("link", { name: /home/i })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      screen.getByRole("link", { name: /browse recipes/i }),
    ).toHaveAttribute("href", "/recipes");
  });

  it("shows a friendly 404 heading", () => {
    render(<NotFound />);
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /couldn.t find that page/i }),
    ).toBeInTheDocument();
  });
});
