CREATE TABLE "food_portions" (
	"food_id" varchar(24) NOT NULL,
	"unit" varchar(40) NOT NULL,
	"grams_per_unit" real NOT NULL,
	"modifier" varchar(60),
	"source" varchar(16) DEFAULT 'usda' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_portions_food_id_unit_pk" PRIMARY KEY("food_id","unit"),
	CONSTRAINT "food_portions_grams_check" CHECK ("food_portions"."grams_per_unit" > 0)
);
--> statement-breakpoint
ALTER TABLE "food_portions" ADD CONSTRAINT "food_portions_food_id_food_items_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "food_portions_food_idx" ON "food_portions" USING btree ("food_id");