ALTER TYPE "public"."recipe_event_type" ADD VALUE IF NOT EXISTS 'suggestion_applied';--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "applied_at" timestamp with time zone;