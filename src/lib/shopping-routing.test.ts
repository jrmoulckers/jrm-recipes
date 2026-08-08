import { describe, expect, it } from "vitest";

import {
  findIngredientRoute,
  ingredientRouteIdentity,
  partitionShoppingItemsByDestination,
  resolveIngredientDestination,
  type ShoppingIngredientRoute,
} from "./shopping-routing";

const routes: ShoppingIngredientRoute[] = [
  {
    id: "route-onion",
    foodId: "food-onion",
    normalizedItem: "onion",
    preferredListId: "qfc",
    alternativeListIds: ["costco", "market"],
  },
];

describe("ingredientRouteIdentity", () => {
  it("prefers a canonical food id", () => {
    expect(
      ingredientRouteIdentity({ item: "Yellow onion", foodId: "food-onion" }),
    ).toEqual({
      key: "food:food-onion",
      foodId: "food-onion",
      normalizedItem: "yellow onion",
    });
  });

  it("falls back to Unicode-preserving normalized text", () => {
    expect(ingredientRouteIdentity({ item: "  بصل أحمر  " })).toMatchObject({
      key: "text:بصل أحمر",
      normalizedItem: "بصل أحمر",
    });
  });
});

describe("findIngredientRoute", () => {
  it("matches canonical identity before normalized text", () => {
    expect(
      findIngredientRoute(
        { item: "Yellow onion", foodId: "food-onion" },
        routes,
      )?.id,
    ).toBe("route-onion");
  });

  it("reuses a normalized legacy rule when no canonical rule exists", () => {
    expect(findIngredientRoute({ item: "Onion" }, routes)?.id).toBe(
      "route-onion",
    );
  });
});

describe("resolveIngredientDestination", () => {
  it("returns one preferred destination and alternatives as metadata", () => {
    expect(
      resolveIngredientDestination(
        { item: "Onion", foodId: "food-onion" },
        routes,
        new Set(["default", "qfc", "costco", "market"]),
        "default",
      ),
    ).toEqual({
      listId: "qfc",
      routeId: "route-onion",
      alternativeListIds: ["costco", "market"],
    });
  });

  it("promotes the first active alternative before falling back to default", () => {
    expect(
      resolveIngredientDestination(
        { item: "Onion", foodId: "food-onion" },
        routes,
        new Set(["default", "market"]),
        "default",
      ).listId,
    ).toBe("market");
  });

  it("uses the explicit default for unrouted ingredients", () => {
    expect(
      resolveIngredientDestination(
        { item: "Milk" },
        routes,
        new Set(["default", "viewed"]),
        "default",
      ).listId,
    ).toBe("default");
  });
});

describe("partitionShoppingItemsByDestination", () => {
  it("places every contribution in exactly one list", () => {
    const items = [
      { item: "Onion", foodId: "food-onion", quantity: 1 },
      { item: "Milk", foodId: null, quantity: 1 },
    ];
    const partitioned = partitionShoppingItemsByDestination(
      items,
      routes,
      new Set(["default", "qfc", "costco"]),
      "default",
    );

    expect(partitioned.get("qfc")).toEqual([items[0]]);
    expect(partitioned.get("default")).toEqual([items[1]]);
    expect([...partitioned.values()].flat()).toHaveLength(items.length);
    expect(partitioned.has("costco")).toBe(false);
  });
});
