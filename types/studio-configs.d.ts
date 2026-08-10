/**
 * Ambient declarations for JS-only ESLint/Prettier packages consumed from the
 * repository's `.js` config files, which `checkJs` type-checks.
 *
 * `eslint-plugin-drizzle` simply ships no types.
 *
 * The two `@jrmoulckers/*` entries are TEMPORARY, pending an upstream fix: the
 * shared packages are authored in JSDoc-annotated JavaScript but publish no
 * `types` entry and no `.d.ts`, so every consumer that type-checks its config
 * files has to declare them by hand.
 */
declare module 'eslint-plugin-drizzle' {
  import type { ESLint } from 'eslint';

  const plugin: ESLint.Plugin;
  export default plugin;
}

declare module '@jrmoulckers/eslint-config/next' {
  import type { Linter } from 'eslint';

  export function nextConfig(options?: {
    ignores?: string[];
    env?: 'browser' | 'node' | 'both';
    rules?: Record<string, unknown>;
    /**
     * Flat-config entries appended last. Typed loosely because plugin objects
     * from different `@types/eslint` versions are not mutually assignable.
     */
    extend?: unknown[];
  }): Linter.Config[];
}

declare module '@jrmoulckers/prettier-config' {
  import type { Config } from 'prettier';

  const config: Config;
  export default config;
}
