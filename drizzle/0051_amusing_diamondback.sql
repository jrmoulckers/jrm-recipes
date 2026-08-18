-- The derived nutrition cache (#1044, ADR-0007). Purely additive: a new table,
-- its FK, and one index. Expand-only per `docs/migrations.md` — nothing in the
-- currently deployed build reads or writes it, so there is no contract phase to
-- follow and no window in which serving code sees a shape it can't handle.
--
-- Guarded so a re-apply against a shared preview/branch database is a no-op.
CREATE TABLE IF NOT EXISTS "recipe_nutrition_cache" (
	"recipe_id" varchar(24) PRIMARY KEY NOT NULL,
	"resolver_version" varchar(40) NOT NULL,
	"source" varchar(16) NOT NULL,
	"per_serving" jsonb NOT NULL,
	"confidence" real,
	"sourced_lines" integer,
	"total_lines" integer,
	"unresolved_lines" jsonb,
	"recipe_updated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_nutrition_cache_source_check" CHECK ("recipe_nutrition_cache"."source" IN ('graph', 'estimate', 'none')),
	CONSTRAINT "recipe_nutrition_cache_confidence_check" CHECK ("recipe_nutrition_cache"."confidence" IS NULL OR ("recipe_nutrition_cache"."confidence" >= 0 AND "recipe_nutrition_cache"."confidence" <= 1)),
	CONSTRAINT "recipe_nutrition_cache_lines_check" CHECK (("recipe_nutrition_cache"."sourced_lines" IS NULL OR "recipe_nutrition_cache"."sourced_lines" >= 0) AND ("recipe_nutrition_cache"."total_lines" IS NULL OR "recipe_nutrition_cache"."total_lines" >= 0))
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "recipe_nutrition_cache" ADD CONSTRAINT "recipe_nutrition_cache_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
	WHEN duplicate_table THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipe_nutrition_cache_version_idx" ON "recipe_nutrition_cache" USING btree ("resolver_version");
