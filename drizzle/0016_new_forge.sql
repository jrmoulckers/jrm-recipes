-- Consolidated security-hardening migration for wave 4 (issues #204/#207/#217/#219).
-- Idempotent by construction: scripts/migrate.mjs runs on EVERY Vercel deploy against a
-- SHARED database, so re-running this against pre-existing objects must never error.
-- Tables/indexes use IF NOT EXISTS; ADD COLUMN uses IF NOT EXISTS; ALTER..ADD CONSTRAINT
-- is wrapped in a DO $$ ... EXCEPTION guard.
--
-- Tables touched:
--   * NEW audit_log            (#219 append-only security audit log)
--   * recipes  ADD share_token, share_link_enabled, share_token_rotated_at  (#204/#207)
--   * users    ADD deleted_at  (#217 Clerk-driven soft delete)
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"actor_id" varchar(24),
	"action" varchar(80) NOT NULL,
	"target_type" varchar(40) NOT NULL,
	"target_id" varchar(24),
	"metadata" jsonb,
	"ip_address" varchar(64),
	"user_agent" varchar(512),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "share_token" varchar(32);--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "share_link_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "share_token_rotated_at" timestamp with time zone;--> statement-breakpoint
-- Backward-compat backfill (#204): every EXISTING unlisted recipe gets a random,
-- unguessable token so its `/r/<token>` link works immediately. Guarded on NULL
-- so it only ever fills gaps (idempotent + safe to re-run). New unlisted recipes
-- get their token from the app at write time.
UPDATE "recipes"
  SET "share_token" = substr(md5(random()::text || clock_timestamp()::text || "id"), 1, 32)
  WHERE "visibility" = 'unlisted' AND "share_token" IS NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_target_idx" ON "audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipes" ADD CONSTRAINT "recipes_share_token_uq" UNIQUE("share_token");
EXCEPTION WHEN duplicate_object THEN null; END $$;