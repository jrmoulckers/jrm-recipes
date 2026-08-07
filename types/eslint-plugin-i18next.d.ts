/**
 * `eslint-plugin-i18next` ships no types, and `.eslintrc.cjs` is inside the
 * tsconfig `include`, so the deep require of its defaults needs a declaration.
 *
 * We require the defaults rather than restating them because the rule merges
 * options shallowly: setting `words` or `callees` at all discards the plugin's
 * own list for that key. Restating them here would silently drift, and the
 * default `words.exclude` carries the full HTML-entity list plus an emoji
 * regex, which is not practical to maintain by hand.
 */
declare module "eslint-plugin-i18next/lib/options/defaults" {
  /** Patterns may be strings, regexes, or nested arrays of either. */
  type Pattern = string | RegExp | Pattern[];

  interface Matcher {
    include: Pattern[];
    exclude: Pattern[];
  }

  const defaults: {
    framework: string;
    mode: string;
    message: string;
    "should-validate-template": boolean;
    "jsx-components": Matcher;
    "jsx-attributes": Matcher;
    "object-properties": Matcher;
    "class-properties": Matcher;
    words: { exclude: Pattern[] };
    callees: { exclude: Pattern[] };
  };

  export = defaults;
}
