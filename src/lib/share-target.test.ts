import { describe, expect, it } from "vitest";

import { pickSharedUrl } from "./share-target";

describe("pickSharedUrl", () => {
  it("prefers a direct http(s) url", () => {
    expect(pickSharedUrl("https://example.com/recipe")).toBe(
      "https://example.com/recipe",
    );
    expect(pickSharedUrl("http://example.com/recipe")).toBe(
      "http://example.com/recipe",
    );
  });

  it("checks candidates in order and skips empty ones", () => {
    expect(
      pickSharedUrl(null, "   ", undefined, "https://example.com/a"),
    ).toBe("https://example.com/a");
  });

  it("digs a bare url out of shared free text", () => {
    expect(
      pickSharedUrl("Check this out https://example.com/marinara please"),
    ).toBe("https://example.com/marinara");
  });

  it("falls through url -> text -> title", () => {
    expect(
      pickSharedUrl(null, "no link here", "Grandma https://example.com/x"),
    ).toBe("https://example.com/x");
  });

  it("rejects non-http(s) schemes", () => {
    expect(pickSharedUrl("javascript:alert(1)")).toBeUndefined();
    expect(pickSharedUrl("data:text/html,<h1>hi</h1>")).toBeUndefined();
    expect(pickSharedUrl("ftp://example.com/file")).toBeUndefined();
  });

  it("returns undefined when nothing usable is shared", () => {
    expect(pickSharedUrl(null, undefined, "")).toBeUndefined();
    expect(pickSharedUrl("just some words")).toBeUndefined();
  });
});
