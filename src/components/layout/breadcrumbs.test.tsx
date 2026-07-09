import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Breadcrumbs } from "./breadcrumbs";
import { IntlWrapper } from "~/test/intl";

afterEach(cleanup);

function renderCrumbs(ui: React.ReactElement) {
  return render(<IntlWrapper>{ui}</IntlWrapper>);
}

describe("Breadcrumbs", () => {
  it("labels the breadcrumb landmark from the message catalog", () => {
    renderCrumbs(
      <Breadcrumbs
        items={[
          { label: "Recipes", href: "/recipes" },
          { label: "Sunday Sauce" },
        ]}
      />,
    );

    expect(
      screen.getByRole("navigation", { name: "Breadcrumb" }),
    ).toBeInTheDocument();
  });

  it("links intermediate crumbs and marks the last as the current page", () => {
    renderCrumbs(
      <Breadcrumbs
        items={[
          { label: "Recipes", href: "/recipes" },
          { label: "Sunday Sauce" },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "Recipes" })).toHaveAttribute(
      "href",
      "/recipes",
    );

    const current = screen.getByText("Sunday Sauce");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(
      screen.queryByRole("link", { name: "Sunday Sauce" }),
    ).not.toBeInTheDocument();
  });

  it("renders nothing when there are no crumbs", () => {
    const { container } = renderCrumbs(<Breadcrumbs items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
