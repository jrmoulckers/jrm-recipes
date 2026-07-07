import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ErrorBoundary from "./error";

beforeEach(() => {
  // The boundary logs to console.error via useEffect; silence it in tests.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("app error boundary", () => {
  it("calls reset() when 'Try again' is clicked", async () => {
    const reset = vi.fn();
    const user = userEvent.setup();

    render(<ErrorBoundary error={new Error("boom")} reset={reset} />);

    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it("offers a link back home", () => {
    render(<ErrorBoundary error={new Error("boom")} reset={vi.fn()} />);
    expect(screen.getByRole("link", { name: /go home/i })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("does not leak the raw error message or stack to the UI", () => {
    render(
      <ErrorBoundary
        error={new Error("SUPER_SECRET_INTERNAL_DETAIL")}
        reset={vi.fn()}
      />,
    );
    expect(
      screen.queryByText(/SUPER_SECRET_INTERNAL_DETAIL/),
    ).not.toBeInTheDocument();
  });

  it("surfaces the opaque digest reference when present", () => {
    const error = Object.assign(new Error("boom"), { digest: "abc123" });
    render(<ErrorBoundary error={error} reset={vi.fn()} />);
    expect(screen.getByText(/abc123/)).toBeInTheDocument();
  });
});
