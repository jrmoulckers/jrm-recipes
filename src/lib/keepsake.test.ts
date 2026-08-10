import { describe, expect, it } from "vitest";

import {
  KEEPSAKE_NOTE_MAX,
  buildKeepsakePath,
  parseKeepsakeMessage,
} from "./keepsake";

describe("buildKeepsakePath", () => {
  const RECIPE_PATH = "/recipes/nonna/banana-bread";

  it("builds a bare keepsake path when there is no message", () => {
    expect(buildKeepsakePath(RECIPE_PATH, {})).toBe(
      "/recipes/nonna/banana-bread/keepsake",
    );
  });

  it("encodes the sender, note, and share token", () => {
    const path = buildKeepsakePath(RECIPE_PATH, {
      from: "Nonna",
      note: "The one you loved as a girl. Love, Nonna.",
      token: "abc123",
    });
    expect(path.startsWith(`${RECIPE_PATH}/keepsake?`)).toBe(true);
    const query = new URLSearchParams(path.split("?")[1]);
    expect(query.get("from")).toBe("Nonna");
    expect(query.get("note")).toBe("The one you loved as a girl. Love, Nonna.");
    expect(query.get("t")).toBe("abc123");
  });

  it("omits empty/whitespace fields", () => {
    const path = buildKeepsakePath(RECIPE_PATH, {
      from: "  ",
      note: "",
      token: null,
    });
    expect(path).toBe(`${RECIPE_PATH}/keepsake`);
  });

  it("round-trips through parseKeepsakeMessage", () => {
    const path = buildKeepsakePath(RECIPE_PATH, {
      from: "Papa",
      note: "Enjoy!",
    });
    const parsed = parseKeepsakeMessage(
      Object.fromEntries(new URLSearchParams(path.split("?")[1])),
    );
    expect(parsed).toEqual({ from: "Papa", note: "Enjoy!" });
  });
});

describe("parseKeepsakeMessage", () => {
  it("trims and returns null for blank values", () => {
    expect(parseKeepsakeMessage({ from: "  ", note: undefined })).toEqual({
      from: null,
      note: null,
    });
  });

  it("caps the note length", () => {
    const long = "a".repeat(KEEPSAKE_NOTE_MAX + 200);
    expect(parseKeepsakeMessage({ note: long }).note).toHaveLength(
      KEEPSAKE_NOTE_MAX,
    );
  });

  it("takes the first value when a param repeats", () => {
    expect(parseKeepsakeMessage({ from: ["Nonna", "someone"] }).from).toBe(
      "Nonna",
    );
  });

  it("preserves simple line breaks but collapses excess blank lines", () => {
    expect(parseKeepsakeMessage({ note: "Line 1\n\n\n\nLine 2" }).note).toBe(
      "Line 1\n\nLine 2",
    );
  });
});
