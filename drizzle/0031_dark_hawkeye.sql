ALTER TYPE "public"."notification_type" ADD VALUE 'follow';--> statement-breakpoint
CREATE TABLE "follows" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"follower_id" varchar(24) NOT NULL,
	"followee_id" varchar(24) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_pair_uq" UNIQUE("follower_id","followee_id"),
	CONSTRAINT "follows_no_self_follow_check" CHECK ("follows"."follower_id" <> "follows"."followee_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "public_activity_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_followee_id_users_id_fk" FOREIGN KEY ("followee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "follows_follower_idx" ON "follows" USING btree ("follower_id");--> statement-breakpoint
CREATE INDEX "follows_followee_idx" ON "follows" USING btree ("followee_id");