import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: { secret: undefined as string | undefined },
}));

vi.mock("~/env", () => ({
  get env() {
    return { CRON_SECRET: state.secret };
  },
}));

import { isCronAuthorized, isCronConfigured } from "./auth";

function req(authorization?: string): Request {
  return new Request("http://localhost/api/cron/digest", {
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  state.secret = undefined;
});

describe("cron auth", () => {
  it("reports unconfigured when CRON_SECRET is unset", () => {
    expect(isCronConfigured()).toBe(false);
    // Even a "Bearer undefined"-style header must never authorize.
    expect(isCronAuthorized(req("Bearer "))).toBe(false);
    expect(isCronAuthorized(req())).toBe(false);
  });

  it("authorizes only the exact bearer secret when configured", () => {
    state.secret = "s3cret";
    expect(isCronConfigured()).toBe(true);
    expect(isCronAuthorized(req("Bearer s3cret"))).toBe(true);
  });

  it("rejects a missing, malformed, or wrong bearer", () => {
    state.secret = "s3cret";
    expect(isCronAuthorized(req())).toBe(false);
    expect(isCronAuthorized(req("s3cret"))).toBe(false);
    expect(isCronAuthorized(req("Bearer wrong"))).toBe(false);
    expect(isCronAuthorized(req("Basic s3cret"))).toBe(false);
  });
});
