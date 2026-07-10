import { describe, expect, it } from "vitest";

import { KID_HAZARD_INFO, detectStepHazards } from "./kid-safety";

describe("detectStepHazards (issue #423)", () => {
  it("flags a hot technique tag (accent + tolerant lookup)", () => {
    expect(detectStepHazards({ techniques: ["Sauté"] })).toEqual(["heat"]);
  });

  it("flags a sharp technique tag (gerund)", () => {
    expect(detectStepHazards({ techniques: ["Dicing"] })).toEqual(["sharp"]);
  });

  it("detects heat from step-text keywords", () => {
    expect(
      detectStepHazards({ text: "Place the tray in the oven for 20 minutes." }),
    ).toEqual(["heat"]);
    expect(
      detectStepHazards({ text: "Bring the water to a boil, then add pasta." }),
    ).toEqual(["heat"]);
  });

  it("detects sharp from step-text keywords", () => {
    expect(
      detectStepHazards({ text: "Slice the carrots into thin rounds." }),
    ).toEqual(["sharp"]);
    expect(
      detectStepHazards({ text: "Grate the cheese over the top." }),
    ).toEqual(["sharp"]);
  });

  it("returns both hazards in a stable order (heat then sharp)", () => {
    expect(
      detectStepHazards({ text: "Sear the steak, then slice it thinly." }),
    ).toEqual(["heat", "sharp"]);
  });

  it("shows no callout for plain, safe steps (no false alarms)", () => {
    expect(detectStepHazards({ text: "Stir the batter gently." })).toEqual([]);
    expect(detectStepHazards({ techniques: ["Fold"] })).toEqual([]);
  });

  it("does not false-match hazard words hidden inside safe words", () => {
    // "cut" must not match inside "cute"; "peel" (banana) is not a hazard —
    // only the peeler *tool* is.
    expect(detectStepHazards({ text: "This cute biscuit is done." })).toEqual(
      [],
    );
    expect(detectStepHazards({ text: "Peel the banana and mash it." })).toEqual(
      [],
    );
  });

  it("exposes visually + verbally distinct heat vs. sharp copy", () => {
    expect(KID_HAZARD_INFO.heat.emoji).not.toEqual(KID_HAZARD_INFO.sharp.emoji);
    expect(KID_HAZARD_INFO.heat.label).not.toEqual(KID_HAZARD_INFO.sharp.label);
  });
});
