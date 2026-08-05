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
    // Copy should be read from `~/messages/*` via next-intl.
    //
    // This is `error` globally. It spent the migration at `warn` behind an
    // allowlist of finished directories, but the backlog is now empty, so an
    // allowlist would only mean a NEW directory starts out unguarded. The one
    // override below turns it off for non-shipping code.
    //
    // The exclusions in `literalStringOptions` are for strings that are
    // structurally not copy, such as class names and route paths. Without them
    // the rule reports things no reader ever sees.
    "i18next/no-literal-string": ["error", literalStringOptions],
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
      // Non-shipping code: tests, fixtures, DB seed data, and the internal
      // design-system reference page are not user-facing product UI, so the
      // literal-string guard would only add noise. `/design` is robots-
      // disallowed, absent from nav, and labels itself "Dev / reference". Its
      // strings are component demo labels, so translating them would pad the
      // catalogs with keys no reader ever sees.
      //
      // This is an exemption, not a backlog. Nothing here is waiting to be
      // migrated, so there is no count to draw down.
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
