import { describe, expect, it } from "vitest";

import {
  celsiusToFahrenheit,
  findPreheatCue,
  formatStepTemperature,
  isIngredientForStep,
  isPreheatStep,
  type CueStep,
} from "./cook-cues";

describe("celsiusToFahrenheit", () => {
  it("converts and rounds to the nearest degree", () => {
    expect(celsiusToFahrenheit(180)).toBe(356);
    expect(celsiusToFahrenheit(200)).toBe(392);
    expect(celsiusToFahrenheit(0)).toBe(32);
    expect(celsiusToFahrenheit(100)).toBe(212);
  });
});

describe("formatStepTemperature", () => {
  it("shows °F for US cooks", () => {
    expect(formatStepTemperature(180, "us")).toBe("356°F");
  });

  it("shows °C for metric, original and grams systems", () => {
    expect(formatStepTemperature(180, "metric")).toBe("180°C");
    expect(formatStepTemperature(180, "original")).toBe("180°C");
    expect(formatStepTemperature(180, "grams")).toBe("180°C");
  });

  it("rounds fractional Celsius", () => {
    expect(formatStepTemperature(63.4, "metric")).toBe("63°C");
  });

  it("hides on null / non-finite input", () => {
    expect(formatStepTemperature(null, "metric")).toBeNull();
    expect(formatStepTemperature(undefined, "us")).toBeNull();
    expect(formatStepTemperature(Number.NaN, "metric")).toBeNull();
  });
});

describe("isPreheatStep", () => {
  it("matches common preheat phrasings", () => {
    expect(isPreheatStep("Preheat the oven to 180°C.")).toBe(true);
    expect(isPreheatStep("Pre-heat oven to 350F")).toBe(true);
    expect(isPreheatStep("Heat the oven to 200°C.")).toBe(true);
    expect(isPreheatStep("Warm your oven while you mix.")).toBe(true);
  });

  it("ignores unrelated steps", () => {
    expect(isPreheatStep("Whisk the eggs and sugar.")).toBe(false);
    expect(isPreheatStep("Heat the milk in a saucepan.")).toBe(false);
  });
});

describe("findPreheatCue", () => {
  // Step positions are stored 0-based in the DB (mutations.ts writes
  // `position: i`) and reach Cook Mode unchanged, so the test data mirrors that.
  // findPreheatCue returns a 1-based stepNumber for display.
  const steps: CueStep[] = [
    { position: 0, instruction: "Mix the dry ingredients." },
    {
      position: 1,
      instruction: "Preheat the oven to 200°C.",
      targetTempC: 200,
    },
    { position: 2, instruction: "Fold in the butter." },
  ];

  it("pulls a later preheat step forward as a 1-based step number", () => {
    // 0-based position 1 is displayed as "Step 2".
    expect(findPreheatCue(steps)).toEqual({ stepNumber: 2, targetTempC: 200 });
  });

  it("returns null when preheating is already the first step", () => {
    expect(
      findPreheatCue([
        { position: 0, instruction: "Preheat the oven to 180°C." },
        { position: 1, instruction: "Cream the butter." },
      ]),
    ).toBeNull();
  });

  it("returns null when no step preheats", () => {
    expect(
      findPreheatCue([
        { position: 0, instruction: "Chop the onions." },
        { position: 1, instruction: "Simmer for 20 minutes." },
      ]),
    ).toBeNull();
  });

  it("respects position order regardless of array order", () => {
    expect(
      findPreheatCue([
        { position: 2, instruction: "Bake until golden." },
        {
          position: 1,
          instruction: "Heat the oven to 220°C.",
          targetTempC: 220,
        },
        { position: 0, instruction: "Roll out the dough." },
      ]),
    ).toEqual({ stepNumber: 2, targetTempC: 220 });
  });
});

describe("isIngredientForStep", () => {
  it("links a 1-based ingredient stepPosition to the 0-based step position", () => {
    // The editor stores "Step 1" as stepPosition 1; the DB stores that first
    // step at position 0. They must still match.
    expect(isIngredientForStep(1, 0)).toBe(true);
    expect(isIngredientForStep(2, 1)).toBe(true);
    expect(isIngredientForStep(3, 2)).toBe(true);
  });

  it("does not link mismatched steps (off-by-one guard)", () => {
    expect(isIngredientForStep(1, 1)).toBe(false);
    expect(isIngredientForStep(2, 0)).toBe(false);
  });

  it("treats an unset link as belonging to no step", () => {
    expect(isIngredientForStep(null, 0)).toBe(false);
    expect(isIngredientForStep(undefined, 2)).toBe(false);
  });
});
