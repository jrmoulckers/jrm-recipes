import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { GroupCard, ProfileCard, ogInitials } from "./social-card";

afterEach(cleanup);

describe("ogInitials", () => {
  it("takes the first letter of the first two words, uppercased", () => {
    expect(ogInitials("Ada Lovelace")).toBe("AL");
    expect(ogInitials("grace hopper jones")).toBe("GH");
  });

  it("falls back to the first characters of a single token", () => {
    expect(ogInitials("mchammer")).toBe("MC");
  });

  it("never returns empty", () => {
    expect(ogInitials("")).toBe("?");
    expect(ogInitials("   ")).toBe("?");
  });
});

describe("ProfileCard", () => {
  it("renders the cook's name, handle, and public-recipe count", () => {
    const { getByText } = render(
      <ProfileCard
        data={{ name: "Ada Lovelace", handle: "ada", recipeCount: 3 }}
      />,
    );
    expect(getByText("Ada Lovelace")).toBeTruthy();
    expect(getByText("@ada")).toBeTruthy();
    expect(getByText("3 public recipes")).toBeTruthy();
  });

  it("singularizes a single recipe", () => {
    const { getByText } = render(
      <ProfileCard data={{ name: "Ada", handle: "ada", recipeCount: 1 }} />,
    );
    expect(getByText("1 public recipe")).toBeTruthy();
  });

  it("renders the neutral brand card when data is null", () => {
    const { getByText, queryByText } = render(<ProfileCard data={null} />);
    expect(getByText("Family recipes, kept alive.")).toBeTruthy();
    expect(queryByText("@ada")).toBeNull();
  });
});

describe("GroupCard", () => {
  it("renders the group name with member and recipe counts", () => {
    const { getByText } = render(
      <GroupCard
        data={{ name: "The Moulckers", memberCount: 4, recipeCount: 12 }}
      />,
    );
    expect(getByText("The Moulckers")).toBeTruthy();
    expect(getByText(/4 members/)).toBeTruthy();
    expect(getByText(/12 recipes/)).toBeTruthy();
  });

  it("singularizes single member and recipe", () => {
    const { getByText } = render(
      <GroupCard data={{ name: "Solo", memberCount: 1, recipeCount: 1 }} />,
    );
    expect(getByText(/1 member/)).toBeTruthy();
    expect(getByText(/1 recipe/)).toBeTruthy();
  });

  it("renders the neutral brand card when data is null", () => {
    const { getByText } = render(<GroupCard data={null} />);
    expect(getByText("Family recipes, kept alive.")).toBeTruthy();
  });
});
