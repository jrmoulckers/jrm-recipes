import base from './config/engineering/prettier/index.js';

/**
 * Shared studio formatting plus the Tailwind class sorter, which is
 * product-specific: `cn` and `cva` are this repository's class-name builders.
 *
 * @type {import("prettier").Config}
 */
export default {
  ...base,
  plugins: ['prettier-plugin-tailwindcss'],
  tailwindFunctions: ['cn', 'cva'],
};
