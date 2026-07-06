DO $$ BEGIN
 CREATE TYPE "public"."meal_slot" AS ENUM('breakfast', 'lunch', 'dinner', 'snack');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meal_plan_entries" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"group_id" varchar(24),
	"date" date NOT NULL,
	"slot" "meal_slot" NOT NULL,
	"recipe_id" varchar(24),
	"note" varchar(300),
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meal_plan_entries_user_date_idx" ON "meal_plan_entries" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meal_plan_entries_recipe_idx" ON "meal_plan_entries" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meal_plan_entries_group_idx" ON "meal_plan_entries" USING btree ("group_id");