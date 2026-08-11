/**
 * Ambient declarations for JS-only ESLint/Prettier packages consumed from the
 * repository's `.js` config files, which `checkJs` type-checks.
 *
 * `eslint-plugin-drizzle` and `@jrmoulckers/prettier-config` ship no types.
 *
 * `@jrmoulckers/eslint-config` is deliberately absent: it ships its own `.d.ts`
 * as of 0.8.0. An ambient `declare module` here would take precedence over the
 * real declarations and silently pin the API to whatever this file happened to
 * describe — the earlier version of this block rejected `typeAware` as "does
 * not exist" months after the preset gained it. Do not re-add it.
 */
declare module 'eslint-plugin-drizzle' {
  import type { ESLint } from 'eslint';

  const plugin: ESLint.Plugin;
  export default plugin;
}

declare module '@jrmoulckers/prettier-config' {
  import type { Config } from 'prettier';

  const config: Config;
  export default config;
}
