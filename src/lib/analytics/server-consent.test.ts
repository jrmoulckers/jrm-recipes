import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ANALYTICS_CONSENT_COOKIE } from "~/config/consent";

const configMock = vi.hoisted(() => ({
  analyticsRequiresConsent: vi.fn(() => false),
}));
vi.mock("./config", () => configMock);

const headersMock = vi.hoisted(() => ({
  cookies: vi.fn(),
  headers: vi.fn(),
}));
vi.mock("next/headers", () => headersMock);

import { serverCaptureAllowed } from "./server-consent";

/** A minimal `cookies()` store exposing just the consent cookie. */
function cookieStore(consent?: string) {
  return {
    get: (name: string) =>
      name === ANALYTICS_CONSENT_COOKIE && consent !== undefined
        ? { value: consent }
        : undefined,
  };
}

/** A minimal `headers()` store backed by a lower-cased name map. */
function headerStore(map: Record<string, string> = {}) {
  return { get: (name: string) => map[name.toLowerCase()] ?? null };
}

function setup(opts: {
  consent?: string;
  headers?: Record<string, string>;
  requireConsent?: boolean;
}) {
  configMock.analyticsRequiresConsent.mockReturnValue(opts.requireConsent ?? false);
  headersMock.cookies.mockResolvedValue(cookieStore(opts.consent));
  headersMock.headers.mockResolvedValue(headerStore(opts.headers));
}

beforeEach(() => {
  configMock.analyticsRequiresConsent.mockReturnValue(false);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("serverCaptureAllowed", () => {
  it("allows capture in the default opt-out model with no cookie", async () => {
    setup({});
    await expect(serverCaptureAllowed()).resolves.toBe(true);
  });

  it("allows capture when the user has explicitly granted", async () => {
    setup({ consent: "granted" });
    await expect(serverCaptureAllowed()).resolves.toBe(true);
  });

  it("blocks when the consent cookie is 'denied'", async () => {
    setup({ consent: "denied" });
    await expect(serverCaptureAllowed()).resolves.toBe(false);
  });

  it("blocks in opt-in mode when consent is unset/missing", async () => {
    setup({ requireConsent: true });
    await expect(serverCaptureAllowed()).resolves.toBe(false);
  });

  it("allows in opt-in mode only once consent is granted", async () => {
    setup({ requireConsent: true, consent: "granted" });
    await expect(serverCaptureAllowed()).resolves.toBe(true);
  });

  it("blocks when Sec-GPC is '1', even with consent granted", async () => {
    setup({ consent: "granted", headers: { "sec-gpc": "1" } });
    await expect(serverCaptureAllowed()).resolves.toBe(false);
  });

  it("blocks when DNT is '1', even in opt-out mode", async () => {
    setup({ headers: { dnt: "1" } });
    await expect(serverCaptureAllowed()).resolves.toBe(false);
  });

  it("fails closed (blocks) when request state can't be read", async () => {
    configMock.analyticsRequiresConsent.mockReturnValue(false);
    headersMock.cookies.mockRejectedValue(new Error("outside request scope"));
    headersMock.headers.mockResolvedValue(headerStore());
    await expect(serverCaptureAllowed()).resolves.toBe(false);
  });
});
