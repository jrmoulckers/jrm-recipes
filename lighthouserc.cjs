/**
 * Lighthouse configuration (issues #205, #1166).
 *
 * A runtime performance gate that complements the static bundle-size budget
 * (#206). CI builds the app, seeds an ephemeral throwaway Postgres (public
 * credentials, no repo secrets), starts the production server in dev-bypass
 * mode, and runs Lighthouse against the key routes, reporting Core Web Vitals
 * lab budgets as warnings so regressions stay visible without blocking the PR
 * until real baselines are calibrated on shared CI hardware. (The static
 * bundle-size budget in #206 stays a hard, blocking gate.)
 *
 * Routes:
 *   /                              landing page
 *   /recipes                       discover feed
 *   /recipes/home-cook/nonnas-sunday-gravy   a seeded, public recipe detail page
 *
 * Budgets (lab, warn-level): LCP <= 2.5s, CLS <= 0.1, TBT <= 200ms, perf >= 0.8.
 * The desktop preset (1x CPU, no mobile throttling) keeps the lab metrics
 * stable on shared CI hardware. Bump a budget deliberately with justification.
 *
 * Consumed by scripts/lighthouse.mjs via `pnpm lhci`; reports stay local.
 */
module.exports = {
  ci: {
    collect: {
      numberOfRuns: 3,
      // Next.js prints "✓ Ready in <n>ms" once `next start` is serving.
      startServerReadyPattern: 'Ready in',
      startServerReadyTimeout: 60000,
      url: [
        'http://localhost:3000/',
        'http://localhost:3000/recipes',
        // The canonical namespaced URL (#666). `home-cook` is the seed's dev
        // user slug; the flat legacy path would only redirect here, and the
        // extra hop would distort the lab metrics.
        'http://localhost:3000/recipes/home-cook/nonnas-sunday-gravy',
      ],
      settings: {
        preset: 'desktop',
        // Required for Chrome on CI runners/containers.
        chromeFlags: '--no-sandbox --disable-gpu',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.8 }],
        'largest-contentful-paint': ['warn', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['warn', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['warn', { maxNumericValue: 200 }],
      },
    },
    upload: {
      // Write HTML/JSON reports locally. CI publishes them as build artifacts.
      target: 'filesystem',
      outputDir: '.lighthouseci',
    },
  },
};
