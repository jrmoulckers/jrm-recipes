import { beforeEach, describe, expect, it, vi } from 'vitest';

const { state, isCronConfigured, isCronAuthorized, isDbConfigured, purge } = vi.hoisted(() => {
  const state = { configured: true, authorized: true, db: true };
  return {
    state,
    isCronConfigured: vi.fn(() => state.configured),
    isCronAuthorized: vi.fn(() => state.authorized),
    isDbConfigured: vi.fn(() => state.db),
    purge: vi.fn(async () => ({ assessmentsDeleted: 2, correctionsDeleted: 3 })),
  };
});

vi.mock('~/server/cron/auth', () => ({ isCronConfigured, isCronAuthorized }));
vi.mock('~/server/db', () => ({ isDbConfigured }));
vi.mock('~/server/dietary/retention', () => ({ purgeExpiredDietaryHistory: purge }));

import { GET } from './route';

function request(): Request {
  return new Request('http://localhost/api/cron/dietary-retention');
}

beforeEach(() => {
  vi.clearAllMocks();
  state.configured = true;
  state.authorized = true;
  state.db = true;
});

describe('GET /api/cron/dietary-retention', () => {
  it('fails closed when cron authentication is unavailable or invalid', async () => {
    state.configured = false;
    expect((await GET(request())).status).toBe(503);

    state.configured = true;
    state.authorized = false;
    expect((await GET(request())).status).toBe(401);
    expect(purge).not.toHaveBeenCalled();
  });

  it('returns zero counts without a configured database', async () => {
    state.db = false;
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      assessmentsDeleted: 0,
      correctionsDeleted: 0,
    });
    expect(purge).not.toHaveBeenCalled();
  });

  it('reports only aggregate purge counts', async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      assessmentsDeleted: 2,
      correctionsDeleted: 3,
    });
  });
});
