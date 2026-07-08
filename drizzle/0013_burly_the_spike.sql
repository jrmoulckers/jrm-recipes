CREATE TABLE IF NOT EXISTS "member_dietary_profiles" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"group_id" varchar(24),
	"name" varchar(80) NOT NULL,
	"allergens" text[],
	"diets" text[],
	"calorie_goal" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "dietary_flags" text[];--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "calories" integer;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "protein_grams" real;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "carbs_grams" real;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "fat_grams" real;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "saturated_fat_grams" real;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "sodium_mg" integer;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "sugar_grams" real;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "fiber_grams" real;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "member_dietary_profiles" ADD CONSTRAINT "member_dietary_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "member_dietary_profiles" ADD CONSTRAINT "member_dietary_profiles_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "member_dietary_profiles_user_idx" ON "member_dietary_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "member_dietary_profiles_group_idx" ON "member_dietary_profiles" USING btree ("group_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipes" ADD CONSTRAINT "recipes_calories_check" CHECK ("recipes"."calories" >= 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipes" ADD CONSTRAINT "recipes_protein_grams_check" CHECK ("recipes"."protein_grams" >= 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipes" ADD CONSTRAINT "recipes_carbs_grams_check" CHECK ("recipes"."carbs_grams" >= 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipes" ADD CONSTRAINT "recipes_fat_grams_check" CHECK ("recipes"."fat_grams" >= 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipes" ADD CONSTRAINT "recipes_saturated_fat_grams_check" CHECK ("recipes"."saturated_fat_grams" >= 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipes" ADD CONSTRAINT "recipes_sodium_mg_check" CHECK ("recipes"."sodium_mg" >= 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipes" ADD CONSTRAINT "recipes_sugar_grams_check" CHECK ("recipes"."sugar_grams" >= 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipes" ADD CONSTRAINT "recipes_fiber_grams_check" CHECK ("recipes"."fiber_grams" >= 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;
