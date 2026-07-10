import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const configMock = vi.hoisted(() => ({
  isAnalyticsConfigured: vi.fn(() => true),
  analyticsKey: vi.fn(() => "phc_test_key"),
  analyticsHost: vi.fn(() => "https://us.i.posthog.com"),
}));

vi.mock("./config", () => configMock);

const consentMock = vi.hoisted(() => ({
  serverCaptureAllowed: vi.fn(async () => true),
}));

vi.mock("./server-consent", () => consentMock);

import {
  captureServer,
  identifyServer,
  aliasServer,
  getAllFlags,
  getFlag,
} from "./server";

function mockFetch(
  response: Partial<Response> & { json?: () => Promise<unknown> },
) {
  const fn = vi.fn((_url: string, _init?: RequestInit): Promise<Response> =>
    Promise.resolve(response as Response),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

type CaptureBody = {
  api_key: string;
  event: string;
  distinct_id: string;
  properties: Record<string, unknown>;
  timestamp?: string;
};

/** Parse the JSON body of the Nth fetch call into a typed capture payload. */
function bodyOf(fetchFn: ReturnType<typeof mockFetch>, call = 0): CaptureBody {
  const init = fetchFn.mock.calls[call]![1]!;
  return JSON.parse(init.body as string) as CaptureBody;
}

beforeEach(() => {
  configMock.isAnalyticsConfigured.mockReturnValue(true);
  configMock.analyticsKey.mockReturnValue("phc_test_key");
  configMock.analyticsHost.mockReturnValue("https://us.i.posthog.com");
  consentMock.serverCaptureAllowed.mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("captureServer", () => {
  it("no-ops (no fetch) when analytics is unconfigured", async () => {
    configMock.isAnalyticsConfigured.mockReturnValue(false);
    const fetchFn = mockFetch({ ok: true });

    await captureServer("user_1", "recipe_deleted", { recipeId: "rec_1" });

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("posts a taxonomy event to the capture endpoint", async () => {
    const fetchFn = mockFetch({ ok: true });

    await captureServer("user_1", "recipe_created", {
      recipeId: "rec_1",
      ingredientCount: 5,
      stepCount: 3,
      hasPhoto: true,
      visibility: "group",
      source: "manual",
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const url = fetchFn.mock.calls[0]![0];
    expect(url).toBe("https://us.i.posthog.com/capture/");
    const body = bodyOf(fetchFn);
    expect(body).toMatchObject({
      api_key: "phc_test_key",
      event: "recipe_created",
      distinct_id: "user_1",
      properties: {
        recipeId: "rec_1",
        ingredientCount: 5,
        visibility: "group",
        source: "manual",
      },
    });
    expect(typeof body.timestamp).toBe("string");
  });

  it("swallows fetch errors (never throws)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    await expect(
      captureServer("user_1", "recipe_deleted", { recipeId: "rec_1" }),
    ).resolves.toBeUndefined();
  });
});

describe("identifyServer / aliasServer", () => {
  it("sends an $identify with non-PII $set properties", async () => {
    const fetchFn = mockFetch({ ok: true });

    await identifyServer("user_1", { group_count: 2, has_recipes: true });

    const body = bodyOf(fetchFn);
    expect(body.event).toBe("$identify");
    expect(body.properties.$set).toEqual({ group_count: 2, has_recipes: true });
  });

  it("strips PII from identify properties", async () => {
    const fetchFn = mockFetch({ ok: true });

    await identifyServer("user_1", { email: "a@b.com", group_count: 1 });

    const body = bodyOf(fetchFn);
    expect(body.properties.$set).toEqual({ group_count: 1 });
  });

  it("sends a $create_alias linking the two ids", async () => {
    const fetchFn = mockFetch({ ok: true });

    await aliasServer("user_1", "anon_device_1");

    const body = bodyOf(fetchFn);
    expect(body.event).toBe("$create_alias");
    expect(body.properties).toMatchObject({
      distinct_id: "user_1",
      alias: "anon_device_1",
    });
  });
});

describe("server consent gate (#471)", () => {
  it("captureServer sends nothing when consent is not allowed", async () => {
    consentMock.serverCaptureAllowed.mockResolvedValue(false);
    const fetchFn = mockFetch({ ok: true });

    await captureServer("user_1", "signup_completed", {});

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("identifyServer sends nothing when consent is not allowed", async () => {
    consentMock.serverCaptureAllowed.mockResolvedValue(false);
    const fetchFn = mockFetch({ ok: true });

    await identifyServer("user_1", { group_count: 2 });

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("aliasServer sends nothing when consent is not allowed", async () => {
    consentMock.serverCaptureAllowed.mockResolvedValue(false);
    const fetchFn = mockFetch({ ok: true });

    await aliasServer("user_1", "anon_device_1");

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("does not even consult consent when analytics is unconfigured", async () => {
    configMock.isAnalyticsConfigured.mockReturnValue(false);
    const fetchFn = mockFetch({ ok: true });

    await captureServer("user_1", "signup_completed", {});

    expect(consentMock.serverCaptureAllowed).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("captures normally once consent is allowed", async () => {
    consentMock.serverCaptureAllowed.mockResolvedValue(true);
    const fetchFn = mockFetch({ ok: true });

    await captureServer("user_1", "signup_completed", {});

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("feature flags", () => {
  it("returns evaluated flags from the decide endpoint", async () => {
    mockFetch({
      ok: true,
      json: async () => ({
        featureFlags: { empty_state_cta: "benefit_led", new_nav: true },
      }),
    });

    await expect(getAllFlags("user_1")).resolves.toEqual({
      empty_state_cta: "benefit_led",
      new_nav: true,
    });
  });

  it("returns control ({}) when unconfigured — never blocks render", async () => {
    configMock.isAnalyticsConfigured.mockReturnValue(false);
    const fetchFn = mockFetch({ ok: true, json: async () => ({}) });

    await expect(getAllFlags("user_1")).resolves.toEqual({});
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("falls back to control when the request fails", async () => {
    mockFetch({ ok: false, json: async () => ({}) });
    await expect(getAllFlags("user_1")).resolves.toEqual({});
  });

  it("attaches an abort timeout signal to the decide request", async () => {
    const fetchFn = mockFetch({
      ok: true,
      json: async () => ({ featureFlags: {} }),
    });

    await getAllFlags("user_1");

    const init = fetchFn.mock.calls[0]![1]!;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("falls back to control when the decide request times out (aborts)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation timed out.", "TimeoutError");
      }),
    );

    await expect(getAllFlags("user_1")).resolves.toEqual({});
  });

  it("getFlag returns the flag value or the provided fallback", async () => {
    mockFetch({
      ok: true,
      json: async () => ({
        featureFlags: { empty_state_cta: "sample_shortcut" },
      }),
    });

    await expect(getFlag("user_1", "empty_state_cta", "control")).resolves.toBe(
      "sample_shortcut",
    );
    await expect(getFlag("user_1", "missing_flag", "control")).resolves.toBe(
      "control",
    );
  });
});
