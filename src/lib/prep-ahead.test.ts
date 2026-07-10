import { describe, expect, it } from "vitest";

import {
  buildPrepAheadReminders,
  detectPrepAheadCues,
  summarizePrepCues,
  type PlannedPrepRecipe,
} from "./prep-ahead";

describe("detectPrepAheadCues", () => {
  it("detects each supported cue from step/ingredient text", () => {
    expect(
      detectPrepAheadCues(["Defrost the chicken"]).map((c) => c.kind),
    ).toEqual(["defrost"]);
    expect(
      detectPrepAheadCues(["Thaw the shrimp overnight"]).map((c) => c.kind),
    ).toEqual(["defrost", "overnight"]);
    expect(
      detectPrepAheadCues(["Marinate the steak"]).map((c) => c.kind),
    ).toEqual(["marinate"]);
    expect(detectPrepAheadCues(["Soak the beans"]).map((c) => c.kind)).toEqual([
      "soak",
    ]);
    expect(detectPrepAheadCues(["Chill the dough"]).map((c) => c.kind)).toEqual(
      ["chill"],
    );
    expect(
      detectPrepAheadCues(["Refrigerate for at least 4 hours"]).map(
        (c) => c.kind,
      ),
    ).toEqual(["chill"]);
    expect(
      detectPrepAheadCues(["Let the roast come to room temperature"]).map(
        (c) => c.kind,
      ),
    ).toEqual(["room-temp"]);
  });

  it("matches across multiple text blocks and returns cues in a stable order", () => {
    const cues = detectPrepAheadCues([
      "Sear the beef",
      "Best if you marinate it the night before",
      "Serve hot",
    ]);
    expect(cues.map((c) => c.kind)).toEqual(["marinate", "overnight"]);
  });

  it("is word-boundaried — no substring false positives", () => {
    // "chilli"/"chilled-out" must not fire "chill"; "cloak" must not fire "soak"
    expect(detectPrepAheadCues(["Add chilli flakes"])).toEqual([]);
    expect(detectPrepAheadCues(["Simmer the sauce"])).toEqual([]);
    expect(detectPrepAheadCues(["Serve immediately"])).toEqual([]);
  });

  it("returns nothing for empty or whitespace-only input", () => {
    expect(detectPrepAheadCues([])).toEqual([]);
    expect(detectPrepAheadCues(["", "   "])).toEqual([]);
  });
});

describe("summarizePrepCues", () => {
  it("formats one, two, and three+ cues naturally", () => {
    expect(
      summarizePrepCues(detectPrepAheadCues(["Defrost the chicken"])),
    ).toBe("defrost");
    expect(
      summarizePrepCues(
        detectPrepAheadCues(["Defrost then marinate the chicken"]),
      ),
    ).toBe("defrost & marinate");
    expect(
      summarizePrepCues(
        detectPrepAheadCues(["Defrost, marinate, and chill the chicken"]),
      ),
    ).toBe("defrost, marinate & chill");
  });

  it("is empty when there are no cues", () => {
    expect(summarizePrepCues([])).toBe("");
  });
});

describe("buildPrepAheadReminders", () => {
  const recipes: PlannedPrepRecipe[] = [
    {
      slug: "sunday-roast",
      title: "Sunday Roast",
      dayLabel: "Thursday",
      texts: ["Defrost the beef", "Bring to room temperature before searing"],
    },
    {
      slug: "weeknight-pasta",
      title: "Weeknight Pasta",
      dayLabel: "Thursday",
      texts: ["Boil pasta", "Toss with sauce and serve"],
    },
  ];

  it("keeps only recipes with cues and carries the day + link slug", () => {
    const reminders = buildPrepAheadReminders(recipes);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({
      slug: "sunday-roast",
      title: "Sunday Roast",
      dayLabel: "Thursday",
      summary: "defrost & bring to room temperature",
    });
  });

  it("returns an empty array when nothing needs a head start", () => {
    expect(
      buildPrepAheadReminders([
        {
          slug: "toast",
          title: "Toast",
          dayLabel: "Monday",
          texts: ["Toast the bread", "Add butter"],
        },
      ]),
    ).toEqual([]);
    expect(buildPrepAheadReminders([])).toEqual([]);
  });
});
