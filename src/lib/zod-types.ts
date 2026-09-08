import type { input, output, ZodType } from 'zod';

type OptionalizeUndefined<T> = T extends Date
  ? T
  : T extends readonly (infer Item)[]
    ? OptionalizeUndefined<Item>[]
    : T extends object
      ? {
          [Key in keyof T as undefined extends T[Key] ? never : Key]: OptionalizeUndefined<T[Key]>;
        } & {
          [Key in keyof T as undefined extends T[Key] ? Key : never]?: OptionalizeUndefined<T[Key]>;
        }
      : T;

/**
 * A schema's parsed value with `undefined`-valued keys left optional. Zod 4
 * represents transformed optional fields as required keys whose value may be
 * `undefined`; callers and persisted snapshots may still omit those keys.
 */
export type ParsedInput<Schema extends ZodType> = OptionalizeUndefined<output<Schema>>;

/** The raw payload accepted by a schema, with omittable keys modeled as optional. */
export type SchemaInput<Schema extends ZodType> = OptionalizeUndefined<input<Schema>>;
