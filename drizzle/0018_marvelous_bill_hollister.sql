-- Consolidated community/social migration for wave-4 batch
-- (issues #333/#334/#340/#341/#342/#345/#346/#348/#349/#352/#353/#355/#356/#357).
-- Idempotent by construction: scripts/migrate.mjs runs on EVERY Vercel deploy against a
-- SHARED database, so re-running this against pre-existing objects must never error.
-- Enums + ALTER..ADD CONSTRAINT are wrapped in DO $$ ... EXCEPTION guards catching BOTH
-- duplicate_object (42710) AND duplicate_table (42P07, raised when a constraint's backing
-- index name already exists); tables, columns and indexes use IF NOT EXISTS.
DO $$ BEGIN
  CREATE TYPE "public"."comment_anchor_type" AS ENUM('ingredient', 'step');
EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."reaction_emoji" AS ENUM('love', 'yum', 'clap', 'wow', 'fire', 'party');
EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."reaction_target" AS ENUM('comment', 'review', 'cook_log');
EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."notification_type" AS ENUM('mention', 'comment_reply', 'suggestion', 'review', 'cook', 'reaction', 'group_invite', 'group_join', 'cook_along_invite', 'cook_along_reminder', 'report');
EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."rsvp_status" AS ENUM('going', 'maybe', 'declined');
EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."moderation_target" AS ENUM('comment', 'review', 'cook_log');
EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."report_reason" AS ENUM('spam', 'harassment', 'inappropriate', 'other');
EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."report_status" AS ENUM('open', 'resolved', 'dismissed');
EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reactions" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"target_type" "reaction_target" NOT NULL,
	"target_id" varchar(24) NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"emoji" "reaction_emoji" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reactions_target_user_emoji_uq" UNIQUE("target_type","target_id","user_id","emoji")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"recipient_id" varchar(24) NOT NULL,
	"actor_id" varchar(24),
	"type" "notification_type" NOT NULL,
	"recipe_id" varchar(24),
	"group_id" varchar(24),
	"entity_id" varchar(24),
	"context" varchar(500),
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cook_along_rsvps" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"cook_along_id" varchar(24) NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"status" "rsvp_status" DEFAULT 'going' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cook_along_rsvps_event_user_uq" UNIQUE("cook_along_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cook_alongs" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"group_id" varchar(24) NOT NULL,
	"recipe_id" varchar(24) NOT NULL,
	"host_id" varchar(24),
	"title" varchar(200),
	"note" text,
	"scheduled_for" timestamp with time zone NOT NULL,
	"reminder_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_reports" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"target_type" "moderation_target" NOT NULL,
	"target_id" varchar(24) NOT NULL,
	"reporter_id" varchar(24) NOT NULL,
	"group_id" varchar(24),
	"reason" "report_reason" NOT NULL,
	"detail" text,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"resolved_by_id" varchar(24),
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_reports_target_reporter_uq" UNIQUE("target_type","target_id","reporter_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_blocks" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"blocker_id" varchar(24) NOT NULL,
	"blocked_id" varchar(24) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_pair_uq" UNIQUE("blocker_id","blocked_id")
);
--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "anchor_type" "comment_anchor_type";--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "anchor_id" varchar(24);--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "anchor_label" varchar(200);--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "hidden_by" varchar(24);--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "photo_url" varchar(2048);--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "hidden_by" varchar(24);--> statement-breakpoint
ALTER TABLE "cook_log_entries" ADD COLUMN IF NOT EXISTS "shared_to_group_id" varchar(24);--> statement-breakpoint
ALTER TABLE "cook_log_entries" ADD COLUMN IF NOT EXISTS "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cook_log_entries" ADD COLUMN IF NOT EXISTS "hidden_by" varchar(24);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "reactions" ADD CONSTRAINT "reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cook_along_rsvps" ADD CONSTRAINT "cook_along_rsvps_cook_along_id_cook_alongs_id_fk" FOREIGN KEY ("cook_along_id") REFERENCES "public"."cook_alongs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cook_along_rsvps" ADD CONSTRAINT "cook_along_rsvps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cook_alongs" ADD CONSTRAINT "cook_alongs_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cook_alongs" ADD CONSTRAINT "cook_alongs_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cook_alongs" ADD CONSTRAINT "cook_alongs_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "comments" ADD CONSTRAINT "comments_hidden_by_users_id_fk" FOREIGN KEY ("hidden_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "reviews" ADD CONSTRAINT "reviews_hidden_by_users_id_fk" FOREIGN KEY ("hidden_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cook_log_entries" ADD CONSTRAINT "cook_log_entries_shared_to_group_id_groups_id_fk" FOREIGN KEY ("shared_to_group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cook_log_entries" ADD CONSTRAINT "cook_log_entries_hidden_by_users_id_fk" FOREIGN KEY ("hidden_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reactions_target_idx" ON "reactions" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reactions_user_idx" ON "reactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_recipient_idx" ON "notifications" USING btree ("recipient_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_recipient_unread_idx" ON "notifications" USING btree ("recipient_id") WHERE "notifications"."read_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_actor_idx" ON "notifications" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_recipe_idx" ON "notifications" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_group_idx" ON "notifications" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cook_along_rsvps_event_idx" ON "cook_along_rsvps" USING btree ("cook_along_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cook_along_rsvps_user_idx" ON "cook_along_rsvps" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cook_alongs_group_scheduled_idx" ON "cook_alongs" USING btree ("group_id","scheduled_for");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cook_alongs_recipe_idx" ON "cook_alongs" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cook_alongs_host_idx" ON "cook_alongs" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_reports_group_status_idx" ON "content_reports" USING btree ("group_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_reports_target_idx" ON "content_reports" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_reports_reporter_idx" ON "content_reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_reports_resolved_by_idx" ON "content_reports" USING btree ("resolved_by_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_blocks_blocker_idx" ON "user_blocks" USING btree ("blocker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_blocks_blocked_idx" ON "user_blocks" USING btree ("blocked_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cook_log_entries_shared_group_idx" ON "cook_log_entries" USING btree ("shared_to_group_id");
