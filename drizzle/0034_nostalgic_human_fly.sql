-- Additive shopping-list routing expansion for issue #630.
-- All DDL is guarded so a shared preview database can safely re-run it.
CREATE TABLE IF NOT EXISTS "shopping_ingredient_route_alternatives" (
	"route_id" varchar(24) NOT NULL,
	"list_id" varchar(24) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "shopping_ingredient_route_alternatives_route_id_list_id_pk" PRIMARY KEY("route_id","list_id"),
	CONSTRAINT "shopping_ingredient_route_alternatives_position_check" CHECK ("shopping_ingredient_route_alternatives"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shopping_ingredient_routes" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"food_id" varchar(24),
	"normalized_item" text NOT NULL,
	"display_item" text NOT NULL,
	"preferred_list_id" varchar(24) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_items" ADD COLUMN IF NOT EXISTS "food_id" varchar(24);--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_lists" ADD COLUMN IF NOT EXISTS "store_name" varchar(120);--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_lists" ADD COLUMN IF NOT EXISTS "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_lists" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;--> statement-breakpoint
-- Preserve the old implicit selection rule. The id tie-break makes equal
-- updated_at values deterministic, and the zero-default guard makes a re-run
-- leave an already selected default untouched.
WITH "users_without_default" AS (
	SELECT "user_id"
	FROM "shopping_lists"
	GROUP BY "user_id"
	HAVING count(*) FILTER (WHERE "is_default") = 0
),
"implicit_winners" AS (
	SELECT DISTINCT ON ("shopping_lists"."user_id") "shopping_lists"."id"
	FROM "shopping_lists"
	INNER JOIN "users_without_default"
		ON "users_without_default"."user_id" = "shopping_lists"."user_id"
	ORDER BY "shopping_lists"."user_id", "shopping_lists"."updated_at" DESC, "shopping_lists"."id" DESC
)
UPDATE "shopping_lists"
SET "is_default" = true
FROM "implicit_winners"
WHERE "shopping_lists"."id" = "implicit_winners"."id"
	AND "shopping_lists"."is_default" = false;--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "shopping_ingredient_route_alternatives"
		ADD CONSTRAINT "shopping_ingredient_route_alternatives_route_id_shopping_ingredient_routes_id_fk"
		FOREIGN KEY ("route_id") REFERENCES "public"."shopping_ingredient_routes"("id")
		ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object OR duplicate_table THEN null;
END $$;--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "shopping_ingredient_route_alternatives"
		ADD CONSTRAINT "shopping_ingredient_route_alternatives_list_id_shopping_lists_id_fk"
		FOREIGN KEY ("list_id") REFERENCES "public"."shopping_lists"("id")
		ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object OR duplicate_table THEN null;
END $$;--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "shopping_ingredient_routes"
		ADD CONSTRAINT "shopping_ingredient_routes_user_id_users_id_fk"
		FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
		ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object OR duplicate_table THEN null;
END $$;--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "shopping_ingredient_routes"
		ADD CONSTRAINT "shopping_ingredient_routes_food_id_food_items_id_fk"
		FOREIGN KEY ("food_id") REFERENCES "public"."food_items"("id")
		ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object OR duplicate_table THEN null;
END $$;--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "shopping_ingredient_routes"
		ADD CONSTRAINT "shopping_ingredient_routes_preferred_list_id_shopping_lists_id_fk"
		FOREIGN KEY ("preferred_list_id") REFERENCES "public"."shopping_lists"("id")
		ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object OR duplicate_table THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shopping_ingredient_route_alternatives_route_position_idx" ON "shopping_ingredient_route_alternatives" USING btree ("route_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shopping_ingredient_route_alternatives_list_idx" ON "shopping_ingredient_route_alternatives" USING btree ("list_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shopping_ingredient_routes_user_food_uq" ON "shopping_ingredient_routes" USING btree ("user_id","food_id") WHERE "shopping_ingredient_routes"."food_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shopping_ingredient_routes_user_normalized_item_uq" ON "shopping_ingredient_routes" USING btree ("user_id","normalized_item");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shopping_ingredient_routes_user_idx" ON "shopping_ingredient_routes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shopping_ingredient_routes_food_idx" ON "shopping_ingredient_routes" USING btree ("food_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shopping_ingredient_routes_preferred_list_idx" ON "shopping_ingredient_routes" USING btree ("preferred_list_id");--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "shopping_list_items"
		ADD CONSTRAINT "shopping_list_items_food_id_food_items_id_fk"
		FOREIGN KEY ("food_id") REFERENCES "public"."food_items"("id")
		ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object OR duplicate_table THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shopping_list_items_food_idx" ON "shopping_list_items" USING btree ("food_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shopping_lists_user_default_uq" ON "shopping_lists" USING btree ("user_id") WHERE "shopping_lists"."is_default" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shopping_lists_user_active_idx" ON "shopping_lists" USING btree ("user_id","updated_at") WHERE "shopping_lists"."archived_at" is null;
