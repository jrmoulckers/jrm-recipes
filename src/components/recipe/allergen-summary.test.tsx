import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AllergenSummary } from "./allergen-summary";

afterEach(cleanup);

describe("AllergenSummary", () => {
  it("lists detected allergens as a Contains summary", () => {
    render(
      <AllergenSummary items={["2 large eggs", "1 cup whole milk", "flour"]} />,
    );

    const region = screen.getByRole("region", { name: /allergen summary/i });
    expect(within(region).getByText(/contains/i)).toBeInTheDocument();

    const badges = within(region).getByRole("list");
    const labels = within(badges)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(labels).toEqual(["Dairy", "Eggs", "Wheat/gluten"]);
  });

  it("shows a best-effort disclaimer alongside the badges", () => {
    render(<AllergenSummary items={["peanut butter"]} />);
    expect(screen.getByText(/double-check the ingredients/i)).toBeInTheDocument();
  });

  it("renders a non-alarming empty state that never claims safety", () => {
    render(<AllergenSummary items={["olive oil", "kosher salt"]} />);
    expect(screen.queryByText(/^contains$/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/no common allergens detected/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/always double-check/i)).toBeInTheDocument();
  });
});
