import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  state,
  isCronConfigured,
  isCronAuthorized,
  isDbConfigured,
  listDigestRecipients,
  getUserDigestData,
  buildWeeklyDigest,
  renderDigestEmail,
  sendSpy,
} = vi.hoisted(() => {
  const state = {
    configured: true,
    authorized: true,
    db: true,
    providerName: "log",
    sendThrowsFor: null as string | null,
  };
  type Recipient = { id: string; email: string | null; name: string | null };
  type DigestData = {
    groups: Array<{ id: string; name: string }>;
    recipes: unknown[];
  };
  return {
    state,
    isCronConfigured: vi.fn(() => state.configured),
    isCronAuthorized: vi.fn(() => state.authorized),
    isDbConfigured: vi.fn(() => state.db),
    listDigestRecipients: vi.fn<() => Promise<Recipient[]>>(),
    getUserDigestData: vi.fn<(userId: string) => Promise<DigestData>>(
      async () => ({ groups: [], recipes: [] }),
    ),
    buildWeeklyDigest: vi.fn<(input: { recipes: unknown[] }) => unknown>(),
    renderDigestEmail: vi.fn(() => ({
      subject: "s",
      html: "<p>h</p>",
      text: "t",
    })),
    sendSpy: vi.fn(async (msg: { to: string }) => {
      if (state.sendThrowsFor && msg.to === state.sendThrowsFor) {
        throw new Error("boom");
      }
    }),
  };
});

vi.mock("~/server/cron/auth", () => ({ isCronConfigured, isCronAuthorized }));
vi.mock("~/server/db", () => ({ isDbConfigured }));
vi.mock("~/server/digest/queries", () => ({
  listDigestRecipients,
  getUserDigestData,
}));
vi.mock("~/server/digest/builder", () => ({ buildWeeklyDigest }));
vi.mock("~/server/digest/email", () => ({
  renderDigestEmail,
  getEmailProvider: () => ({ name: state.providerName, send: sendSpy }),
}));
vi.mock("~/lib/log", () => ({ log: { error: vi.fn(), info: vi.fn() } }));

import { GET } from "./route";

function get(): Request {
  return new Request("http://localhost/api/cron/digest");
}

beforeEach(() => {
  vi.clearAllMocks();
  state.configured = true;
  state.authorized = true;
  state.db = true;
  state.providerName = "log";
  state.sendThrowsFor = null;
});

describe("GET /api/cron/digest — auth", () => {
  it("returns 503 when CRON_SECRET is unconfigured", async () => {
    state.configured = false;
    const res = await GET(get());
    expect(res.status).toBe(503);
    expect(listDigestRecipients).not.toHaveBeenCalled();
  });

  it("returns 401 on a bad/absent bearer", async () => {
    state.authorized = false;
    const res = await GET(get());
    expect(res.status).toBe(401);
    expect(listDigestRecipients).not.toHaveBeenCalled();
  });

  it("no-ops with zero counts when the database is unconfigured", async () => {
    state.db = false;
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, recipients: 0 });
    expect(listDigestRecipients).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/digest — recipient iteration", () => {
  it("sends to opted-in recipients with activity and skips the rest", async () => {
    listDigestRecipients.mockResolvedValue([
      { id: "u1", email: "a@example.com", name: "A" },
      { id: "u2", email: null, name: "B" }, // no email → skipped
      { id: "u3", email: "c@example.com", name: "C" }, // no digest → skipped
    ]);
    buildWeeklyDigest.mockImplementation(
      ({ recipes }: { recipes: unknown[] }) =>
        recipes.length > 0
          ? { groups: [], totalNew: 1, totalUpdated: 0 }
          : null,
    );
    getUserDigestData.mockImplementation(async (userId: string) =>
      userId === "u1"
        ? { groups: [{ id: "g", name: "G" }], recipes: [{ id: "r" }] }
        : { groups: [], recipes: [] },
    );

    const res = await GET(get());
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({ to: "a@example.com" }),
    );
    expect(body).toMatchObject({
      ok: true,
      provider: "log",
      recipients: 3,
      sent: 1,
      skipped: 2,
      failed: 0,
    });
  });

  it("degrades to the log/no-op provider without throwing when no ESP is set", async () => {
    // getEmailProvider returns the log provider (name "log"); send never throws.
    listDigestRecipients.mockResolvedValue([
      { id: "u1", email: "a@example.com", name: "A" },
    ]);
    getUserDigestData.mockResolvedValue({
      groups: [{ id: "g", name: "G" }],
      recipes: [{ id: "r" }],
    });
    buildWeeklyDigest.mockReturnValue({
      groups: [],
      totalNew: 1,
      totalUpdated: 0,
    });

    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ provider: "log", sent: 1 });
  });

  it("isolates a failed send so the run still completes", async () => {
    state.sendThrowsFor = "a@example.com";
    listDigestRecipients.mockResolvedValue([
      { id: "u1", email: "a@example.com", name: "A" },
      { id: "u2", email: "b@example.com", name: "B" },
    ]);
    getUserDigestData.mockResolvedValue({
      groups: [{ id: "g", name: "G" }],
      recipes: [{ id: "r" }],
    });
    buildWeeklyDigest.mockReturnValue({
      groups: [],
      totalNew: 1,
      totalUpdated: 0,
    });

    const res = await GET(get());
    const body = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ sent: 1, failed: 1 });
  });
});
