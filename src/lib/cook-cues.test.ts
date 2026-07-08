import { describe, expect, it } from "vitest";

import {
  celsiusToFahrenheit,
  findPreheatCue,
  formatStepTemperature,
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
  const steps: CueStep[] = [
    { position: 1, instruction: "Mix the dry ingredients." },
    { position: 2, instruction: "Preheat the oven to 200°C.", targetTempC: 200 },
    { position: 3, instruction: "Fold in the butter." },
  ];

  it("pulls a later preheat step forward with its temperature", () => {
    expect(findPreheatCue(steps)).toEqual({ stepNumber: 2, targetTempC: 200 });
  });

  it("returns null when preheating is already the first step", () => {
    expect(
      findPreheatCue([
        { position: 1, instruction: "Preheat the oven to 180°C." },
        { position: 2, instruction: "Cream the butter." },
      ]),
    ).toBeNull();
  });

  it("returns null when no step preheats", () => {
    expect(
      findPreheatCue([
        { position: 1, instruction: "Chop the onions." },
        { position: 2, instruction: "Simmer for 20 minutes." },
      ]),
    ).toBeNull();
  });

  it("respects position order regardless of array order", () => {
    expect(
      findPreheatCue([
        { position: 3, instruction: "Bake until golden." },
        { position: 2, instruction: "Heat the oven to 220°C.", targetTempC: 220 },
        { position: 1, instruction: "Roll out the dough." },
      ]),
    ).toEqual({ stepNumber: 2, targetTempC: 220 });
  });
});
