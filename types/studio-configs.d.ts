/**
 * Ambient declaration for `eslint-plugin-drizzle`, which ships no types and is
 * consumed from `eslint.config.js`, which `checkJs` type-checks.
 *
 * Nothing else belongs here. `@jrmoulckers/prettier-config` used to need an
 * entry; it is now vendored under `config/engineering/`, so TypeScript infers
 * its types from the local source. `@jrmoulckers/eslint-config` ships its own
 * `.d.ts`, and an ambient `declare module` takes precedence over a package's
 * real declarations — the entry that used to be here silently pinned the API
 * and rejected `typeAware` as "does not exist" long after the option shipped.
 * Prefer real types; only declare a module that genuinely ships none.
 */
declare module 'eslint-plugin-drizzle' {
  import type { ESLint } from 'eslint';

  const plugin: ESLint.Plugin;
  export default plugin;
}
