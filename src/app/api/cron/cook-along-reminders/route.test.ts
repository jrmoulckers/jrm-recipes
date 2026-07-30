import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, isCronConfigured, isCronAuthorized, isDbConfigured, sendDue } =
  vi.hoisted(() => {
    const state = { configured: true, authorized: true, db: true, reminded: 0 };
    return {
      state,
      isCronConfigured: vi.fn(() => state.configured),
      isCronAuthorized: vi.fn(() => state.authorized),
      isDbConfigured: vi.fn(() => state.db),
      sendDue: vi.fn(async () => state.reminded),
    };
  });

vi.mock("~/server/cron/auth", () => ({ isCronConfigured, isCronAuthorized }));
vi.mock("~/server/db", () => ({ isDbConfigured }));
vi.mock("~/server/cookalong/mutations", () => ({
  sendDueCookAlongReminders: sendDue,
}));

import { GET } from "./route";

function get(): Request {
  return new Request("http://localhost/api/cron/cook-along-reminders");
}

beforeEach(() => {
  vi.clearAllMocks();
  state.configured = true;
  state.authorized = true;
  state.db = true;
  state.reminded = 0;
});

describe("GET /api/cron/cook-along-reminders", () => {
  it("returns 503 when CRON_SECRET is unconfigured", async () => {
    state.configured = false;
    const res = await GET(get());
    expect(res.status).toBe(503);
    expect(sendDue).not.toHaveBeenCalled();
  });

  it("returns 401 on a bad/absent bearer", async () => {
    state.authorized = false;
    const res = await GET(get());
    expect(res.status).toBe(401);
    expect(sendDue).not.toHaveBeenCalled();
  });

  it("no-ops when the database is unconfigured", async () => {
    state.db = false;
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, reminded: 0 });
    expect(sendDue).not.toHaveBeenCalled();
  });

  it("delegates to sendDueCookAlongReminders and reports the count", async () => {
    state.reminded = 3;
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(sendDue).toHaveBeenCalledWith(2 * 60 * 60 * 1000);
    expect(await res.json()).toMatchObject({ ok: true, reminded: 3 });
  });
});
