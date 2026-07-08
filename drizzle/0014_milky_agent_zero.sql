CREATE TABLE IF NOT EXISTS "group_invite_links" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"group_id" varchar(24) NOT NULL,
	"created_by_id" varchar(24),
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"token" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone,
	"max_uses" integer,
	"use_count" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_invite_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "waitlist_signups" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"source" varchar(60) DEFAULT 'landing' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_signups_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "weekly_digest_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "group_invite_links" ADD CONSTRAINT "group_invite_links_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "group_invite_links" ADD CONSTRAINT "group_invite_links_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "group_invite_links_group_idx" ON "group_invite_links" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "group_invite_links_created_by_idx" ON "group_invite_links" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "waitlist_signups_created_idx" ON "waitlist_signups" USING btree ("created_at");