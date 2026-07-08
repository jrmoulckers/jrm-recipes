// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUserMock, apiSignRequestMock, getLimitStatusMock } = vi.hoisted(
  () => ({
    requireUserMock: vi.fn(),
    apiSignRequestMock: vi.fn(() => "test-signature"),
    getLimitStatusMock: vi.fn(),
  }),
);

vi.mock("~/server/auth", () => ({
  requireUser: requireUserMock,
}));

vi.mock("~/server/billing/entitlements", () => ({
  getLimitStatus: getLimitStatusMock,
}));

vi.mock("cloudinary", () => ({
  v2: {
    utils: {
      api_sign_request: apiSignRequestMock,
    },
  },
}));

vi.mock("~/env", () => ({
  env: {
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: "demo",
    NEXT_PUBLIC_CLOUDINARY_API_KEY: "public-key",
    CLOUDINARY_API_SECRET: "top-secret",
    NEXT_PUBLIC_APP_URL: "https://recipes.example.com",
  },
}));

import { POST } from "./route";

const APP_HOST = "recipes.example.com";
const APP_ORIGIN = `https://${APP_HOST}`;

function freshTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

function makeRequest(
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(`${APP_ORIGIN}/api/cloudinary/sign`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: APP_ORIGIN,
      host: APP_HOST,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireUserMock.mockReset();
  apiSignRequestMock.mockReset();
  apiSignRequestMock.mockReturnValue("test-signature");
  // Default to a signed-in user; individual tests override as needed.
  requireUserMock.mockResolvedValue({ id: "user_1" });
  // Default: under the storage cap, so signing proceeds. The cap test overrides.
  getLimitStatusMock.mockReset();
  getLimitStatusMock.mockResolvedValue({
    limit: 200,
    used: 10,
    remaining: 190,
    ratio: 0.05,
    state: "ok",
  });
});

describe("POST /api/cloudinary/sign", () => {
  it("rejects unauthenticated callers with 401 and signs nothing", async () => {
    requireUserMock.mockRejectedValue(new Error("UNAUTHENTICATED"));

    const res = await POST(
      makeRequest({
        paramsToSign: { timestamp: freshTimestamp(), folder: "heirloom" },
      }),
    );

    expect(res.status).toBe(401);
    expect(apiSignRequestMock).not.toHaveBeenCalled();
    const json = (await res.json()) as { signature?: string };
    expect(json.signature).toBeUndefined();
  });

  it("rejects a foreign origin with 403", async () => {
    const res = await POST(
      makeRequest(
        { paramsToSign: { timestamp: freshTimestamp(), folder: "heirloom" } },
        { origin: "https://evil.example.com", host: APP_HOST },
      ),
    );

    expect(res.status).toBe(403);
    expect(requireUserMock).not.toHaveBeenCalled();
    expect(apiSignRequestMock).not.toHaveBeenCalled();
  });

  it("rejects a missing origin with 403", async () => {
    const req = new Request(`${APP_ORIGIN}/api/cloudinary/sign`, {
      method: "POST",
      headers: { "content-type": "application/json", host: APP_HOST },
      body: JSON.stringify({ paramsToSign: { timestamp: freshTimestamp() } }),
    });

    const res = await POST(req);

    expect(res.status).toBe(403);
    expect(apiSignRequestMock).not.toHaveBeenCalled();
  });

  it("rejects a dangerous key (notification_url) with 400", async () => {
    const res = await POST(
      makeRequest({
        paramsToSign: {
          timestamp: freshTimestamp(),
          folder: "heirloom",
          notification_url: "https://evil.example.com/callback",
        },
      }),
    );

    expect(res.status).toBe(400);
    expect(apiSignRequestMock).not.toHaveBeenCalled();
  });

  it("rejects an arbitrary public_id with 400", async () => {
    const res = await POST(
      makeRequest({
        paramsToSign: {
          timestamp: freshTimestamp(),
          public_id: "../someone-elses-asset",
        },
      }),
    );

    expect(res.status).toBe(400);
    expect(apiSignRequestMock).not.toHaveBeenCalled();
  });

  it("rejects a folder outside the heirloom namespace with 400", async () => {
    const res = await POST(
      makeRequest({
        paramsToSign: { timestamp: freshTimestamp(), folder: "attacker" },
      }),
    );

    expect(res.status).toBe(400);
    expect(apiSignRequestMock).not.toHaveBeenCalled();
  });

  it("rejects a folder attempting path traversal with 400", async () => {
    const res = await POST(
      makeRequest({
        paramsToSign: { timestamp: freshTimestamp(), folder: "heirloom/../evil" },
      }),
    );

    expect(res.status).toBe(400);
    expect(apiSignRequestMock).not.toHaveBeenCalled();
  });

  it("rejects a missing folder with 400 (never signs outside the namespace)", async () => {
    const res = await POST(
      makeRequest({ paramsToSign: { timestamp: freshTimestamp() } }),
    );

    expect(res.status).toBe(400);
    expect(apiSignRequestMock).not.toHaveBeenCalled();
  });

  it("rejects a stale timestamp with 400", async () => {
    const res = await POST(
      makeRequest({
        paramsToSign: {
          timestamp: freshTimestamp() - 60 * 60,
          folder: "heirloom",
        },
      }),
    );

    expect(res.status).toBe(400);
    expect(apiSignRequestMock).not.toHaveBeenCalled();
  });

  it("rejects a missing timestamp with 400", async () => {
    const res = await POST(
      makeRequest({ paramsToSign: { folder: "heirloom" } }),
    );

    expect(res.status).toBe(400);
    expect(apiSignRequestMock).not.toHaveBeenCalled();
  });

  it("refuses to sign a new upload once over the storage cap (402, #318)", async () => {
    getLimitStatusMock.mockResolvedValue({
      limit: 200,
      used: 200,
      remaining: 0,
      ratio: 1,
      state: "blocked",
    });

    const res = await POST(
      makeRequest({
        paramsToSign: { timestamp: freshTimestamp(), folder: "heirloom" },
      }),
    );

    expect(res.status).toBe(402);
    expect(apiSignRequestMock).not.toHaveBeenCalled();
    const json = (await res.json()) as { upgrade?: boolean };
    expect(json.upgrade).toBe(true);
  });

  it("signs only allowlisted params for a signed-in user (happy path)", async () => {
    const timestamp = freshTimestamp();

    const res = await POST(
      makeRequest({
        paramsToSign: { timestamp, folder: "heirloom/cooks", source: "uw" },
      }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { signature?: string };
    expect(json.signature).toBe("test-signature");
    expect(apiSignRequestMock).toHaveBeenCalledTimes(1);
    expect(apiSignRequestMock).toHaveBeenCalledWith(
      { timestamp, folder: "heirloom/cooks", source: "uw" },
      "top-secret",
    );
  });
});
