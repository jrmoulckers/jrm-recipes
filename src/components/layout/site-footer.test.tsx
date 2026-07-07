import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SiteFooter } from "./site-footer";

afterEach(cleanup);

describe("SiteFooter", () => {
  it("labels the footer nav landmark", () => {
    render(<SiteFooter />);

    expect(
      screen.getByRole("navigation", { name: "Footer" }),
    ).toBeInTheDocument();
  });
});
