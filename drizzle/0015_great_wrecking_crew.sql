-- Consolidated billing migration for the monetization batch (issues #300/#301/#325/#326/#331).
-- Idempotent by construction: scripts/migrate.mjs runs on EVERY Vercel deploy against a
-- SHARED database, so re-running this against pre-existing objects must never error.
-- Enums + ALTER..ADD CONSTRAINT are wrapped in DO $$ ... EXCEPTION guards; tables and
-- indexes use IF NOT EXISTS.
DO $$ BEGIN
 CREATE TYPE "public"."billing_owner_type" AS ENUM('user', 'group');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."gift_status" AS ENUM('issued', 'redeemed');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."plan_id" AS ENUM('free', 'family');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'canceled', 'incomplete');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."usage_metric" AS ENUM('recipes', 'storage_mb', 'ai_credits');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "billing_customers" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"user_id" varchar(24),
	"group_id" varchar(24),
	"stripe_customer_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_customers_stripe_customer_uq" UNIQUE("stripe_customer_id"),
	CONSTRAINT "billing_customers_owner_check" CHECK (("billing_customers"."user_id" is not null) <> ("billing_customers"."group_id" is not null))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gift_codes" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"code" varchar(32) NOT NULL,
	"plan_id" "plan_id" DEFAULT 'family' NOT NULL,
	"duration_months" integer DEFAULT 12 NOT NULL,
	"purchaser_user_id" varchar(24),
	"stripe_session_id" varchar(255),
	"status" "gift_status" DEFAULT 'issued' NOT NULL,
	"redeemed_by_user_id" varchar(24),
	"redeemed_by_group_id" varchar(24),
	"redeemed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gift_codes_code_uq" UNIQUE("code"),
	CONSTRAINT "gift_codes_stripe_session_uq" UNIQUE("stripe_session_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptions" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"customer_id" varchar(24) NOT NULL,
	"stripe_subscription_id" varchar(255) NOT NULL,
	"stripe_price_id" varchar(255),
	"plan_id" "plan_id" DEFAULT 'family' NOT NULL,
	"status" "subscription_status" NOT NULL,
	"current_period_end" timestamp with time zone,
	"trial_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"seats" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_stripe_subscription_uq" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usage_counters" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"owner_id" varchar(24) NOT NULL,
	"owner_type" "billing_owner_type" NOT NULL,
	"metric" "usage_metric" NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gift_codes" ADD CONSTRAINT "gift_codes_purchaser_user_id_users_id_fk" FOREIGN KEY ("purchaser_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gift_codes" ADD CONSTRAINT "gift_codes_redeemed_by_user_id_users_id_fk" FOREIGN KEY ("redeemed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gift_codes" ADD CONSTRAINT "gift_codes_redeemed_by_group_id_groups_id_fk" FOREIGN KEY ("redeemed_by_group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customer_id_billing_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."billing_customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "billing_customers_user_uq" ON "billing_customers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "billing_customers_group_uq" ON "billing_customers" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gift_codes_purchaser_idx" ON "gift_codes" USING btree ("purchaser_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gift_codes_redeemed_by_user_idx" ON "gift_codes" USING btree ("redeemed_by_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gift_codes_redeemed_by_group_idx" ON "gift_codes" USING btree ("redeemed_by_group_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_customer_idx" ON "subscriptions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "usage_counters_owner_metric_period_uq" ON "usage_counters" USING btree ("owner_id","metric","period_start");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_counters_owner_idx" ON "usage_counters" USING btree ("owner_id");
