import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Guards the privacy-relevant options passed to `posthog.init()` (#703).
 *
 * These assertions look pedantic, but the bug they exist to catch was subtle:
 * the module *said* it disabled autocapture while only setting
 * `capture_pageview`, and `autocapture` defaults to `true`. So every check here
 * asserts the exact value `false`/`true` rather than truthiness — `undefined`
 * means "the vendor default applies", which is precisely the failure mode.
 *
 * Why these options and not others: events the SDK generates internally never
 * pass through `track()`, so `scrubProperties()` never sees them. Options that
 * enable an SDK-internal capture path put data outside the PII net entirely.
 */

const init = vi.fn();
const analyticsKey = vi.fn<() => string | undefined>();

vi.mock('posthog-js', () => ({
  default: {
    init,
    capture: vi.fn(),
    identify: vi.fn(),
    alias: vi.fn(),
    reset: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    has_opted_out_capturing: vi.fn(() => false),
    isFeatureEnabled: vi.fn(() => undefined),
    getFeatureFlag: vi.fn(() => undefined),
    onFeatureFlags: vi.fn(),
  },
}));

vi.mock('./config', () => ({
  INGEST_PATH: '/ingest',
  analyticsHost: () => 'https://eu.posthog.com',
  analyticsKey: () => analyticsKey(),
}));

/** Re-import with fresh module state, since the module memoizes `initialized`. */
async function initBackend() {
  vi.resetModules();
  const { createPostHogBackend } = await import('./posthog-client');
  return createPostHogBackend();
}

/** The options object handed to `posthog.init()`. */
async function initOptions(): Promise<Record<string, unknown>> {
  await initBackend();
  expect(init).toHaveBeenCalledTimes(1);
  return init.mock.calls[0]![1] as Record<string, unknown>;
}

beforeEach(() => {
  analyticsKey.mockReturnValue('phc_test_key');
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('PostHog client. SDK-internal capture is off', () => {
  it('disables autocapture explicitly, since it defaults to on (#703)', async () => {
    const options = await initOptions();

    // Not `toBeFalsy()`: omitting the option leaves the vendor default of
    // `true`, which is the exact regression this pins.
    expect(options.autocapture).toBe(false);
  });

  it('disables session recording explicitly', async () => {
    const options = await initOptions();

    expect(options.disable_session_recording).toBe(true);
  });

  it('emits pageviews manually rather than via the SDK', async () => {
    const options = await initOptions();

    expect(options.capture_pageview).toBe(false);
  });
});

describe('PostHog client. Privacy posture', () => {
  it('keeps persistence in memory so no analytics cookies are set', async () => {
    const options = await initOptions();

    expect(options.persistence).toBe('memory');
  });

  it('routes capture through the first-party ingest proxy', async () => {
    const options = await initOptions();

    expect(options.api_host).toBe('/ingest');
  });

  it('honors Do Not Track at the SDK level', async () => {
    const options = await initOptions();

    expect(options.respect_dnt).toBe(true);
  });

  it('only creates person profiles once a user is identified', async () => {
    const options = await initOptions();

    expect(options.person_profiles).toBe('identified_only');
  });
});

describe('PostHog client. Lifecycle', () => {
  it('returns null and never loads the SDK when unconfigured', async () => {
    analyticsKey.mockReturnValue(undefined);

    await expect(initBackend()).resolves.toBeNull();
    expect(init).not.toHaveBeenCalled();
  });

  it('initializes once even when called repeatedly', async () => {
    vi.resetModules();
    const { createPostHogBackend } = await import('./posthog-client');

    await createPostHogBackend();
    await createPostHogBackend();

    expect(init).toHaveBeenCalledTimes(1);
  });
});
