import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type CaptureResult = import('posthog-js').CaptureResult;

/**
 * Guards the privacy-relevant options passed to `posthog.init()` (#703).
 *
 * These assertions look pedantic, but the bug they exist to catch was subtle:
 * the module *said* it disabled autocapture while only setting
 * `capture_pageview`, and `autocapture` defaults to `true`. So every check here
 * asserts the exact value `false`/`true` rather than truthiness — `undefined`
 * means "the vendor default applies", which is precisely the failure mode.
 *
 * SDK-generated events do not pass through `track()`, so `before_send` is the
 * structural privacy boundary. The explicit disables remain data-minimization
 * controls rather than the only thing preventing unsanitized capture.
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
  it.each([
    {
      source: 'direct capture',
      input: {
        uuid: '10000000-0000-4000-8000-000000000001',
        event: 'recipe_created',
        properties: {
          token: 'phc_project_key',
          distinct_id: 'user_internal_123',
          recipeId: 'recipe_internal_456',
          email: 'person@example.test',
          note: 'call 555-123-4567',
        },
      },
      expected: {
        token: 'phc_project_key',
        distinct_id: 'user_internal_123',
        recipeId: 'recipe_internal_456',
        note: '[redacted]',
      },
    },
    {
      source: 'SDK pageleave',
      input: {
        uuid: '10000000-0000-4000-8000-000000000002',
        event: '$pageleave',
        properties: {
          token: 'phc_project_key',
          distinct_id: 'device_internal_123',
          $device_id: 'device_internal_123',
          $session_id: 'session_internal_456',
          $window_id: 'window_internal_789',
          $current_url:
            'https://heirloom.example/recipes/private-recipe-id/cook?email=person%40example.test#step',
          $referrer:
            'https://search.example/results?q=private+family+recipe&email=person%40example.test',
          $session_entry_url:
            'https://heirloom.example/join/private-group-invite-token?utm_content=private',
          $session_entry_referrer: 'https://community.example/private-family-post?member=person',
          $session_entry_pathname: '/r/private-recipe-share-token',
          $session_entry_utm_content: 'person@example.test',
          $prev_pageview_pathname: '/groups/private-family-slug',
          $initial_pathname: '/recipes/private-cook/private-recipe-slug',
          title: 'Private family recipe',
          utm_campaign: 'private-family-campaign',
          ph_keyword: 'private family recipe',
        },
      },
      expected: {
        token: 'phc_project_key',
        distinct_id: 'device_internal_123',
        $device_id: 'device_internal_123',
        $session_id: 'session_internal_456',
        $window_id: 'window_internal_789',
        $current_url: 'https://heirloom.example/recipes/:id/cook',
        $referrer: 'https://search.example',
        $session_entry_url: 'https://heirloom.example/join/:token',
        $session_entry_referrer: 'https://community.example',
        $session_entry_pathname: '/r/:token',
        $session_entry_utm_content: '[redacted]',
        $prev_pageview_pathname: '/groups/:slug',
        $initial_pathname: '/recipes/:cook/:recipe',
        title: '[redacted]',
        utm_campaign: '[redacted]',
        ph_keyword: '[redacted]',
      },
    },
    {
      source: 'SDK autocapture',
      input: {
        uuid: '10000000-0000-4000-8000-000000000003',
        event: '$autocapture',
        properties: {
          token: 'phc_project_key',
          distinct_id: 'device_internal_123',
          $event_type: 'click',
          $el_text: 'Private family recipe',
          $el_attr__aria_label: 'Cook Private family recipe',
          $elements: [
            {
              tag_name: 'button',
              $el_text: 'Private family recipe',
              attr__aria_label: 'Cook Private family recipe',
            },
          ],
          $elements_chain: 'button:attr__aria_label="Cook Private family recipe"',
          $external_click_url: 'https://outside.example/private/path?secret=value',
        },
      },
      expected: {
        token: 'phc_project_key',
        distinct_id: 'device_internal_123',
        $event_type: 'click',
        $el_text: '[redacted]',
        $el_attr__aria_label: '[redacted]',
        $elements: '[redacted]',
        $elements_chain: '[redacted]',
        $external_click_url: 'https://outside.example',
      },
    },
    {
      source: 'SDK heatmap event',
      input: {
        uuid: '10000000-0000-4000-8000-000000000004',
        event: '$$heatmap',
        properties: {
          token: 'phc_project_key',
          distinct_id: 'device_internal_123',
          $heatmap_data: {
            'https://heirloom.example/r/private-recipe-share-token?secret=value#recipe': [
              { x: 10, y: 20, type: 'click' },
            ],
            'https://heirloom.example/r/another-private-token?email=person%40example.test': [
              { x: 30, y: 40, type: 'mousemove' },
            ],
          },
        },
      },
      expected: {
        token: 'phc_project_key',
        distinct_id: 'device_internal_123',
        $heatmap_data: {
          'https://heirloom.example/r/:token': [
            { x: 10, y: 20, type: 'click' },
            { x: 30, y: 40, type: 'mousemove' },
          ],
        },
      },
    },
    {
      source: 'SDK web-vitals event',
      input: {
        uuid: '10000000-0000-4000-8000-000000000005',
        event: '$web_vitals',
        properties: {
          token: 'phc_project_key',
          distinct_id: 'device_internal_123',
          $web_vitals_LCP_value: 1234,
          $web_vitals_LCP_event: {
            name: 'LCP',
            value: 1234,
            rating: 'good',
            $current_url:
              'https://heirloom.example/recipes/private-cook/private-recipe?secret=value',
            $session_id: 'session_internal_456',
          },
        },
      },
      expected: {
        token: 'phc_project_key',
        distinct_id: 'device_internal_123',
        $web_vitals_LCP_value: 1234,
        $web_vitals_LCP_event: {
          name: 'LCP',
          value: 1234,
          rating: 'good',
          $current_url: 'https://heirloom.example/recipes/:cook/:recipe',
          $session_id: 'session_internal_456',
        },
      },
    },
    {
      source: 'SDK feature flag event',
      input: {
        uuid: '10000000-0000-4000-8000-000000000006',
        event: '$feature_flag_called',
        properties: {
          token: 'phc_project_key',
          distinct_id: 'user_internal_123',
          $device_id: 'device_internal_123',
          $session_id: 'session_internal_456',
          $feature_flag: 'empty-library-cta',
          $feature_flag_response: 'benefit',
          $active_feature_flags: ['empty-library-cta'],
          '$feature/empty-library-cta': 'benefit',
        },
      },
      expected: {
        token: 'phc_project_key',
        distinct_id: 'user_internal_123',
        $device_id: 'device_internal_123',
        $session_id: 'session_internal_456',
        $feature_flag: 'empty-library-cta',
        $feature_flag_response: 'benefit',
        $active_feature_flags: ['empty-library-cta'],
        '$feature/empty-library-cta': 'benefit',
      },
    },
  ] satisfies Array<{
    source: string;
    input: CaptureResult;
    expected: Record<string, unknown>;
  }>)('scrubs $source before any event reaches transport', async ({ input, expected }) => {
    const options = await initOptions();
    const beforeSend = options.before_send as (
      capture: CaptureResult | null,
    ) => CaptureResult | null;

    expect(beforeSend(input)).toEqual({ ...input, properties: expected });
  });

  it('scrubs identify property bags without changing the event envelope', async () => {
    const options = await initOptions();
    const beforeSend = options.before_send as (
      capture: CaptureResult | null,
    ) => CaptureResult | null;
    const input = {
      uuid: '10000000-0000-4000-8000-000000000007',
      event: '$identify',
      properties: {
        token: 'phc_project_key',
        distinct_id: 'user_internal_123',
        $set: {
          has_recipes: true,
          email: 'person@example.test',
        },
      },
      $set: {
        group_count: 2,
        phone: '555-123-4567',
      },
      $set_once: {
        created_at: '2026-09-04T00:00:00.000Z',
        fullName: 'Private person',
        $current_url: 'https://heirloom.example/r/private-recipe-share-token?secret=value',
        $referrer: 'not a valid referrer',
      },
    } satisfies CaptureResult;

    expect(beforeSend(input)).toEqual({
      ...input,
      properties: {
        token: 'phc_project_key',
        distinct_id: 'user_internal_123',
        $set: { has_recipes: true },
      },
      $set: { group_count: 2 },
      $set_once: {
        created_at: '2026-09-04T00:00:00.000Z',
        $current_url: 'https://heirloom.example/r/:token',
        $referrer: '[redacted]',
      },
    });
  });

  it('preserves null events rejected by an earlier before_send hook', async () => {
    const options = await initOptions();
    const beforeSend = options.before_send as (
      capture: CaptureResult | null,
    ) => CaptureResult | null;

    expect(beforeSend(null)).toBeNull();
  });

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
