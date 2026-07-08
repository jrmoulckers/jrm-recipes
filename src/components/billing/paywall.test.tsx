import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LockBadge, LockedFeatureCard } from "./lock-badge";
import { UpgradeDialog } from "./upgrade-dialog";

afterEach(cleanup);

describe("LockBadge", () => {
  it("defaults to a calm Family label", () => {
    render(<LockBadge />);
    expect(screen.getByText("Family")).toBeInTheDocument();
  });

  it("accepts a custom label", () => {
    render(<LockBadge label="Premium" />);
    expect(screen.getByText("Premium")).toBeInTheDocument();
  });
});

describe("LockedFeatureCard", () => {
  it("routes its single CTA to /pricing", () => {
    render(<LockedFeatureCard />);
    const cta = screen.getByRole("link", { name: "See plans" });
    expect(cta).toHaveAttribute("href", "/pricing");
  });

  it("reassures that existing content stays free (no dark pattern)", () => {
    render(<LockedFeatureCard />);
    expect(screen.getByText(/already saved stays free/i)).toBeInTheDocument();
  });

  it("uses the provided title", () => {
    render(<LockedFeatureCard title="AI recipe generation" />);
    expect(
      screen.getByRole("heading", { name: "AI recipe generation" }),
    ).toBeInTheDocument();
  });
});

describe("UpgradeDialog", () => {
  it("explains the gated feature and links to /pricing when open", () => {
    render(<UpgradeDialog feature="aiGeneration" open />);

    expect(
      screen.getByRole("heading", { name: /Unlock Family/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/AI recipe generation is part of Family/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See plans" })).toHaveAttribute(
      "href",
      "/pricing",
    );
  });

  it("offers a dismiss control (no forced conversion)", () => {
    render(<UpgradeDialog open />);
    expect(
      screen.getByRole("button", { name: "Not now" }),
    ).toBeInTheDocument();
  });
});
