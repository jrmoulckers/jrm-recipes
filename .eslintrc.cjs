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
    // Guard against new hardcoded user-facing copy leaking into JSX once the
    // message catalogs exist (#238). WARN keeps `next lint` green while the
    // existing English strings are migrated surface-by-surface; new code should
    // read copy from `~/messages/*` via next-intl. Flags JSX text and the
    // user-facing attributes below; non-JSX/TS code is exempt (mode jsx-only).
    "i18next/no-literal-string": [
      "warn",
      {
        mode: "jsx-only",
        "jsx-attributes": {
          include: ["alt", "aria-label", "placeholder", "title"],
        },
      },
    ],
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
      // Non-shipping code: tests, fixtures, and DB seed data are not
      // user-facing UI, so the literal-string guard would only add noise.
      files: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "src/test/**",
        "src/server/db/seed.ts",
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
