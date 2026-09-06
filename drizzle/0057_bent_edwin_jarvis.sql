CREATE TABLE "recipe_source_images" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"recipe_id" varchar(24) NOT NULL,
	"position" integer NOT NULL,
	"image_url" varchar(2048) NOT NULL,
	"caption" varchar(500),
	"alt_text" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_source_images_recipe_position_uq" UNIQUE("recipe_id","position"),
	CONSTRAINT "recipe_source_images_position_check" CHECK ("recipe_source_images"."position" >= 0 and "recipe_source_images"."position" < 12)
);
--> statement-breakpoint
ALTER TABLE "recipe_source_images" ADD CONSTRAINT "recipe_source_images_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_source_images_recipe_idx" ON "recipe_source_images" USING btree ("recipe_id","position");--> statement-breakpoint
CREATE INDEX "recipe_source_images_url_idx" ON "recipe_source_images" USING btree ("image_url");