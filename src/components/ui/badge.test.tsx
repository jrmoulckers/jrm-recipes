import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "./badge";

describe("Badge", () => {
  it("renders the default variant", () => {
    const { getByText } = render(<Badge>Default</Badge>);
    const el = getByText("Default");
    expect(el.className).toContain("bg-primary/12");
    expect(el.className).toContain("text-primary");
  });

  it("renders status variants with semantic tokens", () => {
    const cases: Array<[React.ComponentProps<typeof Badge>["variant"], string]> = [
      ["success", "bg-success/15"],
      ["warning", "bg-warning/20"],
      ["info", "bg-info/15"],
      ["destructive", "bg-destructive/15"],
    ];
    for (const [variant, expected] of cases) {
      const { getByText } = render(<Badge variant={variant}>{variant}</Badge>);
      expect(getByText(String(variant)).className).toContain(expected);
    }
  });

  it("maps the info variant to the info foreground token", () => {
    const { getByText } = render(<Badge variant="info">Info</Badge>);
    expect(getByText("Info").className).toContain("text-info");
  });

  it("merges custom className with variant classes", () => {
    const { getByText } = render(
      <Badge variant="info" className="custom-x">
        Info
      </Badge>,
    );
    const el = getByText("Info");
    expect(el.className).toContain("custom-x");
    expect(el.className).toContain("bg-info/15");
  });
});
