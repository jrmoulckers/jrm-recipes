CREATE TABLE "food_aliases" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"food_id" varchar(24) NOT NULL,
	"alias" varchar(160) NOT NULL,
	"source" varchar(16) DEFAULT 'mined' NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_aliases_food_alias_uq" UNIQUE("food_id","alias"),
	CONSTRAINT "food_aliases_use_count_check" CHECK ("food_aliases"."use_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "food_items" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(120) NOT NULL,
	"category" varchar(40) NOT NULL,
	"density_g_per_ml" real,
	"parent_id" varchar(24),
	"source" varchar(16) DEFAULT 'curated' NOT NULL,
	"recipe_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_items_slug_unique" UNIQUE("slug"),
	CONSTRAINT "food_items_recipe_count_check" CHECK ("food_items"."recipe_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "food_nutrition" (
	"food_id" varchar(24) PRIMARY KEY NOT NULL,
	"kcal" real NOT NULL,
	"protein_g" real NOT NULL,
	"carbs_g" real NOT NULL,
	"fat_g" real NOT NULL,
	"fiber_g" real,
	"sugar_g" real,
	"sodium_mg" real,
	"source_ref" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_nutrition_kcal_check" CHECK ("food_nutrition"."kcal" >= 0),
	CONSTRAINT "food_nutrition_protein_check" CHECK ("food_nutrition"."protein_g" >= 0),
	CONSTRAINT "food_nutrition_carbs_check" CHECK ("food_nutrition"."carbs_g" >= 0),
	CONSTRAINT "food_nutrition_fat_check" CHECK ("food_nutrition"."fat_g" >= 0)
);
--> statement-breakpoint
CREATE TABLE "food_pairs" (
	"food_a_id" varchar(24) NOT NULL,
	"food_b_id" varchar(24) NOT NULL,
	"co_count" integer DEFAULT 0 NOT NULL,
	"lift" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_pairs_food_a_id_food_b_id_pk" PRIMARY KEY("food_a_id","food_b_id"),
	CONSTRAINT "food_pairs_order_check" CHECK ("food_pairs"."food_a_id" < "food_pairs"."food_b_id"),
	CONSTRAINT "food_pairs_co_count_check" CHECK ("food_pairs"."co_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "food_prep_stats" (
	"food_id" varchar(24) NOT NULL,
	"prep" varchar(200) NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_prep_stats_food_id_prep_pk" PRIMARY KEY("food_id","prep"),
	CONSTRAINT "food_prep_stats_use_count_check" CHECK ("food_prep_stats"."use_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "food_recipe_links" (
	"food_id" varchar(24) NOT NULL,
	"recipe_id" varchar(24) NOT NULL,
	"use_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_recipe_links_food_id_recipe_id_pk" PRIMARY KEY("food_id","recipe_id"),
	CONSTRAINT "food_recipe_links_use_count_check" CHECK ("food_recipe_links"."use_count" >= 1)
);
--> statement-breakpoint
CREATE TABLE "food_unit_stats" (
	"food_id" varchar(24) NOT NULL,
	"unit" varchar(40) NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"p10" real,
	"p50" real,
	"p90" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_unit_stats_food_id_unit_pk" PRIMARY KEY("food_id","unit"),
	CONSTRAINT "food_unit_stats_use_count_check" CHECK ("food_unit_stats"."use_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user_food_prefs" (
	"user_id" varchar(24) NOT NULL,
	"food_id" varchar(24) NOT NULL,
	"preferred_unit" varchar(40),
	"preferred_variant_id" varchar(24),
	"preferred_prep" varchar(200),
	"use_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_food_prefs_user_id_food_id_pk" PRIMARY KEY("user_id","food_id"),
	CONSTRAINT "user_food_prefs_use_count_check" CHECK ("user_food_prefs"."use_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "food_aliases" ADD CONSTRAINT "food_aliases_food_id_food_items_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_items" ADD CONSTRAINT "food_items_parent_id_food_items_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."food_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_nutrition" ADD CONSTRAINT "food_nutrition_food_id_food_items_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_pairs" ADD CONSTRAINT "food_pairs_food_a_id_food_items_id_fk" FOREIGN KEY ("food_a_id") REFERENCES "public"."food_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_pairs" ADD CONSTRAINT "food_pairs_food_b_id_food_items_id_fk" FOREIGN KEY ("food_b_id") REFERENCES "public"."food_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_prep_stats" ADD CONSTRAINT "food_prep_stats_food_id_food_items_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_recipe_links" ADD CONSTRAINT "food_recipe_links_food_id_food_items_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_recipe_links" ADD CONSTRAINT "food_recipe_links_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_unit_stats" ADD CONSTRAINT "food_unit_stats_food_id_food_items_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_food_prefs" ADD CONSTRAINT "user_food_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_food_prefs" ADD CONSTRAINT "user_food_prefs_food_id_food_items_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_food_prefs" ADD CONSTRAINT "user_food_prefs_preferred_variant_id_food_items_id_fk" FOREIGN KEY ("preferred_variant_id") REFERENCES "public"."food_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "food_aliases_alias_idx" ON "food_aliases" USING btree ("alias");--> statement-breakpoint
CREATE INDEX "food_items_category_idx" ON "food_items" USING btree ("category");--> statement-breakpoint
CREATE INDEX "food_items_parent_idx" ON "food_items" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "food_nutrition_source_idx" ON "food_nutrition" USING btree ("source_ref");--> statement-breakpoint
CREATE INDEX "food_pairs_a_idx" ON "food_pairs" USING btree ("food_a_id");--> statement-breakpoint
CREATE INDEX "food_pairs_b_idx" ON "food_pairs" USING btree ("food_b_id");--> statement-breakpoint
CREATE INDEX "food_prep_stats_food_idx" ON "food_prep_stats" USING btree ("food_id");--> statement-breakpoint
CREATE INDEX "food_recipe_links_recipe_idx" ON "food_recipe_links" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "food_unit_stats_food_idx" ON "food_unit_stats" USING btree ("food_id");--> statement-breakpoint
CREATE INDEX "user_food_prefs_user_idx" ON "user_food_prefs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_food_prefs_food_idx" ON "user_food_prefs" USING btree ("food_id");