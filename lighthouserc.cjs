/**
 * Lighthouse CI configuration (issue #205).
 *
 * A runtime performance gate that complements the static bundle-size budget
 * (#206). CI builds the app, seeds an ephemeral throwaway Postgres (public
 * credentials — no repo secrets), starts the production server in dev-bypass
 * mode, and runs Lighthouse against the key routes, reporting Core Web Vitals
 * lab budgets as warnings so regressions stay visible without blocking the PR
 * until real baselines are calibrated on shared CI hardware. (The static
 * bundle-size budget in #206 stays a hard, blocking gate.)
 *
 * Routes:
 *   /                              landing page
 *   /recipes                       discover feed
 *   /recipes/nonnas-sunday-gravy   a seeded, public recipe detail page
 *
 * Budgets (lab, warn-level): LCP <= 2.5s, CLS <= 0.1, TBT <= 200ms, perf >= 0.8.
 * The desktop preset (1x CPU, no mobile throttling) keeps the lab metrics
 * stable on shared CI hardware; bump a budget deliberately with justification.
 *
 * `.cjs` (not `.js`) because this package is ESM ("type":"module") and LHCI
 * loads the config with `require()`; CI passes `--config=./lighthouserc.cjs`.
 */
module.exports = {
  ci: {
    collect: {
      numberOfRuns: 3,
      startServerCommand: "pnpm start",
      // Next.js prints "✓ Ready in <n>ms" once `next start` is serving.
      startServerReadyPattern: "Ready in",
      startServerReadyTimeout: 60000,
      url: [
        "http://localhost:3000/",
        "http://localhost:3000/recipes",
        "http://localhost:3000/recipes/nonnas-sunday-gravy",
      ],
      settings: {
        preset: "desktop",
        // Required for Chrome on CI runners/containers.
        chromeFlags: "--no-sandbox --disable-gpu",
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["warn", { minScore: 0.8 }],
        "largest-contentful-paint": ["warn", { maxNumericValue: 2500 }],
        "cumulative-layout-shift": ["warn", { maxNumericValue: 0.1 }],
        "total-blocking-time": ["warn", { maxNumericValue: 200 }],
      },
    },
    upload: {
      // Write HTML/JSON reports locally; CI publishes them as build artifacts.
      target: "filesystem",
      outputDir: ".lighthouseci",
      reportFilenamePattern: "%%PATHNAME%%-%%DATETIME%%.report.%%EXTENSION%%",
    },
  },
};
