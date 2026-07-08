import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CardDietaryBadge, type CardDietaryMember } from "./card-dietary-badge";
import { useActiveMemberStore } from "~/lib/active-member-store";

afterEach(cleanup);

const MEMBERS: CardDietaryMember[] = [
  { id: "m1", name: "Ada", allergens: ["dairy", "peanut"] },
  { id: "m2", name: "Bo", allergens: [] },
];

describe("CardDietaryBadge", () => {
  beforeEach(() => {
    useActiveMemberStore.setState({ activeMemberId: null });
  });

  it("renders nothing when no member is active", () => {
    const { container } = render(
      <CardDietaryBadge members={MEMBERS} recipeAllergens={["dairy"]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the active member has no recorded allergies", () => {
    useActiveMemberStore.setState({ activeMemberId: "m2" });
    const { container } = render(
      <CardDietaryBadge members={MEMBERS} recipeAllergens={["dairy"]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("reassures when the recipe trips none of the member's allergens", () => {
    useActiveMemberStore.setState({ activeMemberId: "m1" });
    render(
      <CardDietaryBadge members={MEMBERS} recipeAllergens={["soy"]} />,
    );
    expect(screen.getByText(/looks safe for ada/i)).toBeInTheDocument();
  });

  it("warns and names the conflicting allergen", () => {
    useActiveMemberStore.setState({ activeMemberId: "m1" });
    render(
      <CardDietaryBadge
        members={MEMBERS}
        recipeAllergens={["dairy", "soy"]}
      />,
    );
    expect(screen.getByText(/contains dairy/i)).toBeInTheDocument();
    // Best-effort disclaimer is exposed for assistive tech.
    expect(
      screen.getByLabelText(/double-check labels and brands/i),
    ).toBeInTheDocument();
  });
});
