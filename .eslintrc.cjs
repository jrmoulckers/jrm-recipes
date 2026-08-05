// The i18next plugin shallow-merges its options, so any key we set replaces the
// plugin's default for that key wholesale. Spreading its own defaults keeps them
// authoritative rather than copying lists that will drift (the default word
// exclusions alone carry every HTML entity name).
const i18nextDefaults = require("eslint-plugin-i18next/lib/options/defaults");

// Shared by the global `warn` rule and the per-area `error` ratchet below, so
// the two can never drift into checking different things at different severities.
const literalStringOptions = {
  mode: "jsx-only",
  "jsx-attributes": {
    // Deliberately no `exclude` spread here. With a non-empty `include`
    // and an empty `exclude`, the rule validates these attributes and
    // skips every other one, which is exactly the narrow scope we want.
    include: ["alt", "aria-label", "placeholder", "title"],
  },
  "jsx-components": {
    // Elements whose contents are code or key names, never prose.
    exclude: [
      ...i18nextDefaults["jsx-components"].exclude,
      "code",
      "kbd",
      "pre",
      "samp",
    ],
  },
  callees: {
    // Class-name builders. Their arguments are Tailwind strings.
    exclude: [
      ...i18nextDefaults.callees.exclude,
      "cn",
      "clsx",
      "cva",
      "twMerge",
    ],
  },
  words: {
    // Route paths and URLs are identifiers, not translatable copy.
    exclude: [...i18nextDefaults.words.exclude, "/.*", "https?://.*"],
  },
};

/** @type {import("eslint").Linter.Config} */
const config = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: true,
  },
  plugins: ["@typescript-eslint", "drizzle", "i18next"],
  extends: [
    "next/core-web-vitals",
    "plugin:@typescript-eslint/recommended-type-checked",
    "plugin:@typescript-eslint/stylistic-type-checked",
  ],
  rules: {
    "@typescript-eslint/array-type": "off",
    "@typescript-eslint/consistent-type-definitions": "off",
    "@typescript-eslint/consistent-type-imports": [
      "warn",
      { prefer: "type-imports", fixStyle: "inline-type-imports" },
    ],
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/require-await": "off",
    "@typescript-eslint/no-misused-promises": [
      "error",
      { checksVoidReturn: { attributes: false } },
    ],
    "@typescript-eslint/no-explicit-any": "warn",
    // Guard against new hardcoded user-facing copy leaking into JSX (#238).
    // Copy should be read from `~/messages/*` via next-intl. Areas that have
    // finished migrating are raised to `error` in the overrides below, so they
    // cannot regress; the rest stay at `warn` and are capped by `--max-warnings`
    // in the lint script, which lets the backlog shrink but never grow.
    //
    // The exclusions below are for strings that are structurally not copy. They
    // keep the warning count honest: a count padded with class names and route
    // paths cannot be used as a ratchet.
    "i18next/no-literal-string": ["warn", literalStringOptions],
    "drizzle/enforce-delete-with-where": [
      "error",
      { drizzleObjectName: ["db"] },
    ],
    "drizzle/enforce-update-with-where": [
      "error",
      { drizzleObjectName: ["db"] },
    ],
  },
  overrides: [
    {
      // The ratchet (#238). Every area listed here has finished migrating its
      // copy into `src/messages/*`, so the guard is raised from `warn` to
      // `error`: new hardcoded UI copy fails the build instead of joining a
      // backlog nobody reads.
      //
      // Areas NOT listed are the remaining backlog. They stay at `warn` and
      // are capped by `--max-warnings` in the lint script, so the count can
      // fall but never rise. Move an area here once it reaches zero.
      files: [
        "src/app/embed/**",
        "src/app/not-found.tsx",
        "src/components/a11y/**",
        "src/components/cook/**",
        "src/components/print/**",
        "src/components/recipe/**",
        "src/components/ui/**",
        "src/app/~offline/**",
        "src/app/layout.tsx",
        "src/components/analytics/**",
        "src/components/auth/**",
        "src/components/billing/**",
        "src/components/collections/**",
        "src/components/cooklog/**",
        "src/components/dietary/**",
        "src/components/engagement/**",
        "src/components/follows/**",
        "src/components/groups/**",
        "src/components/household/**",
        "src/components/i18n/**",
        "src/components/layout/**",
        "src/components/marketing/**",
        "src/components/moderation/**",
        "src/components/notifications/**",
        "src/components/onboarding/**",
        "src/components/planner/**",
        "src/components/privacy/**",
        "src/components/profile/**",
        "src/components/pwa/**",
        "src/components/settings/**",
        "src/components/shopping/**",
        "src/components/theme/**",
        "src/lib/**",
        "src/server/**",
      ],
      rules: {
        "i18next/no-literal-string": ["error", literalStringOptions],
      },
    },
    {
      // Non-shipping code: tests, fixtures, DB seed data, and the internal
      // design-system reference page are not user-facing product UI, so the
      // literal-string guard would only add noise. `/design` is robots-
      // disallowed, absent from nav, and labels itself "Dev / reference"; its
      // strings are component demo labels, so translating them would pad the
      // catalogs with keys no reader ever sees.
      //
      // This override is LAST on purpose: later overrides win in ESLint, so
      // keeping it here means the ratchet above never re-enables the rule for
      // a test file that happens to live inside a locked area.
      files: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "src/test/**",
        "src/server/db/seed.ts",
        "src/app/(main)/design/**",
      ],
      rules: {
        "i18next/no-literal-string": "off",
      },
    },
  ],
  ignorePatterns: [
    "node_modules/",
    ".next/",
    "public/sw.js",
    "public/swe-worker*.js",
    "src/app/sw.ts",
    "*.config.js",
    "*.config.ts",
    "coverage/",
    "playwright-report/",
    "test-results/",
  ],
};

module.exports = config;
