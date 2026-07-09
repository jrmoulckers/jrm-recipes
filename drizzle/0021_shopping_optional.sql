-- 0021: persist the ingredient "optional" flag on shopping-list lines (#56).
-- Additive boolean column on the pre-existing "shopping_list_items" table so
-- optional garnishes / "to taste" items keep their marker through both the
-- synced (DB) and offline persistence paths.
-- Idempotent by construction (scripts/migrate.mjs runs on EVERY Vercel deploy
-- against a SHARED database): ADD COLUMN IF NOT EXISTS so re-running the whole
-- chain and then re-running 0021 is a no-op.
ALTER TABLE "shopping_list_items" ADD COLUMN IF NOT EXISTS "optional" boolean DEFAULT false NOT NULL;
