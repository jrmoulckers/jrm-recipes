-- Package-preference, stable-requirement, and non-lossy precision migration for issue #629.
-- Double precision keeps server persistence equivalent to JavaScript package math
-- at boundaries where float4 could otherwise round a requirement down.
ALTER TABLE IF EXISTS "recipe_ingredients" ALTER COLUMN "quantity" TYPE double precision USING "quantity"::double precision;--> statement-breakpoint
ALTER TABLE IF EXISTS "recipe_ingredients" ALTER COLUMN "quantity_max" TYPE double precision USING "quantity_max"::double precision;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_items" ALTER COLUMN "quantity" TYPE double precision USING "quantity"::double precision;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_items" ALTER COLUMN "quantity_max" TYPE double precision USING "quantity_max"::double precision;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_restore_point_items" ALTER COLUMN "quantity" TYPE double precision USING "quantity"::double precision;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_restore_point_items" ALTER COLUMN "quantity_max" TYPE double precision USING "quantity_max"::double precision;--> statement-breakpoint
ALTER TABLE IF EXISTS "custom_units" ALTER COLUMN "base_amount" TYPE double precision USING "base_amount"::double precision;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_ingredient_routes" ADD COLUMN IF NOT EXISTS "package_amount" double precision;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_ingredient_routes" ADD COLUMN IF NOT EXISTS "package_unit" varchar(40);--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_ingredient_routes" ADD COLUMN IF NOT EXISTS "package_label" varchar(120);--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_ingredient_routes" ADD COLUMN IF NOT EXISTS "package_rounding" boolean;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_items" ADD COLUMN IF NOT EXISTS "required_base_quantity" double precision;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_items" ADD COLUMN IF NOT EXISTS "required_base_quantity_max" double precision;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_items" ADD COLUMN IF NOT EXISTS "required_base_unit" varchar(40);--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_items" ADD COLUMN IF NOT EXISTS "purchase_quantity" double precision;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_items" ADD COLUMN IF NOT EXISTS "purchase_unit" varchar(40);--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_items" ADD COLUMN IF NOT EXISTS "package_count" integer;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_items" ADD COLUMN IF NOT EXISTS "package_amount" double precision;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_items" ADD COLUMN IF NOT EXISTS "package_unit" varchar(40);--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_items" ADD COLUMN IF NOT EXISTS "package_label" varchar(120);--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_restore_point_items" ADD COLUMN IF NOT EXISTS "required_base_quantity" double precision;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_restore_point_items" ADD COLUMN IF NOT EXISTS "required_base_quantity_max" double precision;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_restore_point_items" ADD COLUMN IF NOT EXISTS "required_base_unit" varchar(40);--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_restore_point_items" ADD COLUMN IF NOT EXISTS "purchase_quantity" double precision;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_restore_point_items" ADD COLUMN IF NOT EXISTS "purchase_unit" varchar(40);--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_restore_point_items" ADD COLUMN IF NOT EXISTS "package_count" integer;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_restore_point_items" ADD COLUMN IF NOT EXISTS "package_amount" double precision;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_restore_point_items" ADD COLUMN IF NOT EXISTS "package_unit" varchar(40);--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_restore_point_items" ADD COLUMN IF NOT EXISTS "package_label" varchar(120);--> statement-breakpoint
ALTER TABLE IF EXISTS "user_unit_preferences" ADD COLUMN IF NOT EXISTS "package_rounding" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "shopping_ingredient_routes" ADD CONSTRAINT "shopping_ingredient_routes_package_amount_check" CHECK ("shopping_ingredient_routes"."package_amount" is null or "shopping_ingredient_routes"."package_amount" > 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_ingredient_routes" VALIDATE CONSTRAINT "shopping_ingredient_routes_package_amount_check";--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "shopping_ingredient_routes" ADD CONSTRAINT "shopping_ingredient_routes_package_pair_check" CHECK (("shopping_ingredient_routes"."package_amount" is null and "shopping_ingredient_routes"."package_unit" is null) or ("shopping_ingredient_routes"."package_amount" is not null and "shopping_ingredient_routes"."package_unit" is not null)) NOT VALID;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_ingredient_routes" VALIDATE CONSTRAINT "shopping_ingredient_routes_package_pair_check";--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_required_base_quantity_check" CHECK ("shopping_list_items"."required_base_quantity" is null or "shopping_list_items"."required_base_quantity" >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_items" VALIDATE CONSTRAINT "shopping_list_items_required_base_quantity_check";--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_required_base_quantity_max_check" CHECK ("shopping_list_items"."required_base_quantity_max" is null or "shopping_list_items"."required_base_quantity_max" >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_items" VALIDATE CONSTRAINT "shopping_list_items_required_base_quantity_max_check";--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_required_base_quantity_range_check" CHECK ("shopping_list_items"."required_base_quantity_max" is null or "shopping_list_items"."required_base_quantity" is null or "shopping_list_items"."required_base_quantity_max" >= "shopping_list_items"."required_base_quantity") NOT VALID;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_items" VALIDATE CONSTRAINT "shopping_list_items_required_base_quantity_range_check";--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_purchase_quantity_check" CHECK ("shopping_list_items"."purchase_quantity" is null or "shopping_list_items"."purchase_quantity" >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_items" VALIDATE CONSTRAINT "shopping_list_items_purchase_quantity_check";--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_package_count_check" CHECK ("shopping_list_items"."package_count" is null or "shopping_list_items"."package_count" >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_items" VALIDATE CONSTRAINT "shopping_list_items_package_count_check";--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_package_amount_check" CHECK ("shopping_list_items"."package_amount" is null or "shopping_list_items"."package_amount" > 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_items" VALIDATE CONSTRAINT "shopping_list_items_package_amount_check";--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_package_result_check" CHECK (("shopping_list_items"."package_count" is null and "shopping_list_items"."purchase_quantity" is null and "shopping_list_items"."purchase_unit" is null and "shopping_list_items"."package_amount" is null and "shopping_list_items"."package_unit" is null) or ("shopping_list_items"."package_count" is not null and "shopping_list_items"."purchase_quantity" is not null and "shopping_list_items"."purchase_unit" is not null and "shopping_list_items"."package_amount" is not null and "shopping_list_items"."package_unit" is not null)) NOT VALID;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_items" VALIDATE CONSTRAINT "shopping_list_items_package_result_check";--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "shopping_list_restore_point_items" ADD CONSTRAINT "shopping_list_restore_point_items_required_base_quantity_check" CHECK ("shopping_list_restore_point_items"."required_base_quantity" is null or "shopping_list_restore_point_items"."required_base_quantity" >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_restore_point_items" VALIDATE CONSTRAINT "shopping_list_restore_point_items_required_base_quantity_check";--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "shopping_list_restore_point_items" ADD CONSTRAINT "shopping_list_restore_point_items_required_base_quantity_max_check" CHECK ("shopping_list_restore_point_items"."required_base_quantity_max" is null or "shopping_list_restore_point_items"."required_base_quantity_max" >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_restore_point_items" VALIDATE CONSTRAINT "shopping_list_restore_point_items_required_base_quantity_max_check";--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "shopping_list_restore_point_items" ADD CONSTRAINT "shopping_list_restore_point_items_required_base_quantity_range_check" CHECK ("shopping_list_restore_point_items"."required_base_quantity_max" is null or "shopping_list_restore_point_items"."required_base_quantity" is null or "shopping_list_restore_point_items"."required_base_quantity_max" >= "shopping_list_restore_point_items"."required_base_quantity") NOT VALID;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_restore_point_items" VALIDATE CONSTRAINT "shopping_list_restore_point_items_required_base_quantity_range_check";--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "shopping_list_restore_point_items" ADD CONSTRAINT "shopping_list_restore_point_items_purchase_quantity_check" CHECK ("shopping_list_restore_point_items"."purchase_quantity" is null or "shopping_list_restore_point_items"."purchase_quantity" >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_restore_point_items" VALIDATE CONSTRAINT "shopping_list_restore_point_items_purchase_quantity_check";--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "shopping_list_restore_point_items" ADD CONSTRAINT "shopping_list_restore_point_items_package_count_check" CHECK ("shopping_list_restore_point_items"."package_count" is null or "shopping_list_restore_point_items"."package_count" >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_restore_point_items" VALIDATE CONSTRAINT "shopping_list_restore_point_items_package_count_check";--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "shopping_list_restore_point_items" ADD CONSTRAINT "shopping_list_restore_point_items_package_amount_check" CHECK ("shopping_list_restore_point_items"."package_amount" is null or "shopping_list_restore_point_items"."package_amount" > 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_restore_point_items" VALIDATE CONSTRAINT "shopping_list_restore_point_items_package_amount_check";--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "shopping_list_restore_point_items" ADD CONSTRAINT "shopping_list_restore_point_items_package_result_check" CHECK (("shopping_list_restore_point_items"."package_count" is null and "shopping_list_restore_point_items"."purchase_quantity" is null and "shopping_list_restore_point_items"."purchase_unit" is null and "shopping_list_restore_point_items"."package_amount" is null and "shopping_list_restore_point_items"."package_unit" is null) or ("shopping_list_restore_point_items"."package_count" is not null and "shopping_list_restore_point_items"."purchase_quantity" is not null and "shopping_list_restore_point_items"."purchase_unit" is not null and "shopping_list_restore_point_items"."package_amount" is not null and "shopping_list_restore_point_items"."package_unit" is not null)) NOT VALID;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE IF EXISTS "shopping_list_restore_point_items" VALIDATE CONSTRAINT "shopping_list_restore_point_items_package_result_check";