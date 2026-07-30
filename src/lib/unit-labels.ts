/**
 * Readable display labels for the built-in units in {@link ./units}. Used by the
 * settings unit pickers and the editor's unit combobox so a cook sees "Cup" or
 * "Milliliter (mL)" rather than a bare canonical id. Falls back to the id for
 * anything unmapped (e.g. a user's custom unit name).
 */

const UNIT_LABELS: Record<string, string> = {
  tsp: "Teaspoon (tsp)",
  tbsp: "Tablespoon (tbsp)",
  "fl oz": "Fluid ounce (fl oz)",
  cup: "Cup",
  pint: "Pint",
  quart: "Quart",
  gallon: "Gallon",
  ml: "Milliliter (mL)",
  l: "Liter (L)",
  oz: "Ounce (oz)",
  lb: "Pound (lb)",
  g: "Gram (g)",
  kg: "Kilogram (kg)",
  "°F": "Fahrenheit (°F)",
  "°C": "Celsius (°C)",
  K: "Kelvin (K)",
};

/** A friendly label for a unit id, or the id itself when unmapped. */
export function unitLabel(id: string): string {
  return UNIT_LABELS[id] ?? id;
}
