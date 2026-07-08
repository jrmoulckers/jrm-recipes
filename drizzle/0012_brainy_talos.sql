DO $$ BEGIN
 CREATE TYPE "public"."collection_visibility" AS ENUM('private', 'unlisted', 'public');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recipe_views" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"recipe_id" varchar(24) NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_views_user_recipe_uq" UNIQUE("user_id","recipe_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saved_searches" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"name" varchar(80) NOT NULL,
	"query" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_searches_user_name_uq" UNIQUE("user_id","name")
);
--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "visibility" "collection_visibility" DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "share_token" varchar(24);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipe_views" ADD CONSTRAINT "recipe_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipe_views" ADD CONSTRAINT "recipe_views_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipe_views_user_viewed_idx" ON "recipe_views" USING btree ("user_id","viewed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipe_views_recipe_idx" ON "recipe_views" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saved_searches_user_created_idx" ON "saved_searches" USING btree ("user_id","created_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "collections" ADD CONSTRAINT "collections_shareToken_unique" UNIQUE("share_token");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null;
END $$;