-- Wave-5 user-legacy batch: heirloom recipe metadata.
-- Additive columns on the pre-existing "recipes" table:
--   * story (#377): free-text "Story & memories", distinct from notes.
--   * handed_down_from / origin_year / origin_place (#381): structured provenance.
-- Idempotent by construction (scripts/migrate.mjs runs on EVERY Vercel deploy
-- against a SHARED database): ALTER TABLE IF EXISTS + ADD COLUMN IF NOT EXISTS so
-- re-runs never error and a preview DB missing the base table skips gracefully
-- (Postgres raises a NOTICE, not undefined_table 42P01).
ALTER TABLE IF EXISTS "recipes" ADD COLUMN IF NOT EXISTS "story" text;--> statement-breakpoint
ALTER TABLE IF EXISTS "recipes" ADD COLUMN IF NOT EXISTS "handed_down_from" varchar(200);--> statement-breakpoint
ALTER TABLE IF EXISTS "recipes" ADD COLUMN IF NOT EXISTS "origin_year" varchar(40);--> statement-breakpoint
ALTER TABLE IF EXISTS "recipes" ADD COLUMN IF NOT EXISTS "origin_place" varchar(200);
