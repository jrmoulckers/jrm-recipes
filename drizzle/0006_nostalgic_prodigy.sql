DO $$ BEGIN
 CREATE TYPE "public"."recipe_event_type" AS ENUM('created', 'adapted', 'updated', 'published');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recipe_events" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"recipe_id" varchar(24) NOT NULL,
	"actor_id" varchar(24),
	"type" "recipe_event_type" NOT NULL,
	"note" text,
	"related_recipe_id" varchar(24),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipe_events" ADD CONSTRAINT "recipe_events_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipe_events" ADD CONSTRAINT "recipe_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipe_events" ADD CONSTRAINT "recipe_events_related_recipe_id_recipes_id_fk" FOREIGN KEY ("related_recipe_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipe_events_recipe_idx" ON "recipe_events" USING btree ("recipe_id","created_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipes" ADD CONSTRAINT "recipes_forked_from_id_recipes_id_fk" FOREIGN KEY ("forked_from_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;