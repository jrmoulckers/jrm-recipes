/**
 * Barrel for the Drizzle schema. `drizzle.config.ts` and the db client both
 * point here, so every table + relation is registered in one place.
 */
export * from './users';
export * from './groups';
export * from './recipes';
export * from './engagement';
export * from './reviews';
export * from './follows';
export * from './cooklog';
export * from './reactions';
export * from './notifications';
export * from './cookalong';
export * from './moderation';
export * from './shopping';
export * from './planner';
export * from './collections';
export * from './media';
export * from './views';
export * from './searches';
export * from './dietary';
export * from './preferences';
export * from './ingredients';
export * from './waitlist';
export * from './billing';
export * from './audit';
export * from './deletion';
