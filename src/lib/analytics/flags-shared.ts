/**
 * Shared feature-flag value types (issue #335). Kept in their own tiny module so
 * the pure resolver (`./flags`), the server helper (`~/server/flags`) and the
 * client provider can all share them without pulling in React or server-only code.
 */

/** A flag is a boolean (on/off) or a string (multivariate variant key). */
export type FlagValue = string | boolean;

/** A map of flag key → evaluated value, as returned by the analytics backend. */
export type FlagMap = Record<string, FlagValue>;
