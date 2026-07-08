import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SiteFooter } from "./site-footer";
import { IntlWrapper } from "~/test/intl";

afterEach(cleanup);

describe("SiteFooter", () => {
  it("labels the footer nav landmark from the message catalog", () => {
    render(
      <IntlWrapper>
        <SiteFooter />
      </IntlWrapper>,
    );

    expect(
      screen.getByRole("navigation", { name: "Footer" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Recipes" })).toBeInTheDocument();
  });
});
