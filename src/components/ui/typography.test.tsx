import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Heading, Text } from "./typography";

afterEach(cleanup);

describe("Heading", () => {
  it("renders the semantic element for its level", () => {
    const { getByText } = render(<Heading level={1}>Title</Heading>);
    const el = getByText("Title");
    expect(el.tagName).toBe("H1");
    expect(el.className).toContain("text-h1");
    expect(el.className).toContain("font-display");
    expect(el.className).toContain("text-balance");
  });

  it("defaults to level 2", () => {
    const { getByText } = render(<Heading>Title</Heading>);
    expect(getByText("Title").tagName).toBe("H2");
  });

  it("decouples visual size from semantic level", () => {
    const { getByText } = render(
      <Heading level={2} size="display">
        Hero
      </Heading>,
    );
    const el = getByText("Hero");
    expect(el.tagName).toBe("H2");
    expect(el.className).toContain("text-display");
  });

  it("supports rendering as a different element", () => {
    const { getByText } = render(
      <Heading level={3} as="p">
        Faux
      </Heading>,
    );
    expect(getByText("Faux").tagName).toBe("P");
  });
});

describe("Text", () => {
  it("renders body copy by default", () => {
    const { getByText } = render(<Text>Body</Text>);
    const el = getByText("Body");
    expect(el.tagName).toBe("P");
    expect(el.className).toContain("text-body");
    expect(el.className).toContain("text-foreground");
    expect(el.className).toContain("text-pretty");
  });

  it("supports muted and small variants", () => {
    const { getByText: getMuted } = render(
      <Text variant="muted">Muted</Text>,
    );
    expect(getMuted("Muted").className).toContain("text-muted-foreground");

    const { getByText: getSmall } = render(
      <Text variant="small">Small</Text>,
    );
    const small = getSmall("Small");
    expect(small.className).toContain("text-body-sm");
    expect(small.className).toContain("text-muted-foreground");
  });

  it("can render inline via `as`", () => {
    const { getByText } = render(<Text as="span">Inline</Text>);
    expect(getByText("Inline").tagName).toBe("SPAN");
  });
});
