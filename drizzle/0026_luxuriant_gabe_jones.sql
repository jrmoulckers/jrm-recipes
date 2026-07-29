CREATE TABLE "food_items" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(120) NOT NULL,
	"category" varchar(40) NOT NULL,
	"density_g_per_ml" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_items_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX "food_items_category_idx" ON "food_items" USING btree ("category");