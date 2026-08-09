CREATE TABLE "shopping_list_restore_point_items" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"restore_point_id" varchar(24) NOT NULL,
	"item" varchar(300) NOT NULL,
	"quantity" real,
	"quantity_max" real,
	"unit" varchar(40),
	"category" varchar(40),
	"note" varchar(300),
	"optional" boolean DEFAULT false NOT NULL,
	"checked" boolean DEFAULT false NOT NULL,
	"recipe_id" varchar(24),
	"food_id" varchar(24),
	"position" integer NOT NULL,
	CONSTRAINT "shopping_list_restore_point_items_position_check" CHECK ("shopping_list_restore_point_items"."position" >= 0),
	CONSTRAINT "shopping_list_restore_point_items_quantity_check" CHECK ("shopping_list_restore_point_items"."quantity" >= 0),
	CONSTRAINT "shopping_list_restore_point_items_quantity_max_check" CHECK ("shopping_list_restore_point_items"."quantity_max" >= 0),
	CONSTRAINT "shopping_list_restore_point_items_quantity_range_check" CHECK ("shopping_list_restore_point_items"."quantity_max" is null or "shopping_list_restore_point_items"."quantity" is null or "shopping_list_restore_point_items"."quantity_max" >= "shopping_list_restore_point_items"."quantity")
);
--> statement-breakpoint
CREATE TABLE "shopping_list_restore_points" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"list_id" varchar(24) NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"operation" varchar(40) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shopping_list_restore_points_operation_check" CHECK ("shopping_list_restore_points"."operation" in ('remove_completed', 'clear_all', 'bulk_move_source', 'bulk_move_destination', 'rebuild', 'restore'))
);
--> statement-breakpoint
ALTER TABLE "shopping_list_restore_point_items" ADD CONSTRAINT "shopping_list_restore_point_items_restore_point_id_shopping_list_restore_points_id_fk" FOREIGN KEY ("restore_point_id") REFERENCES "public"."shopping_list_restore_points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_restore_point_items" ADD CONSTRAINT "shopping_list_restore_point_items_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_restore_point_items" ADD CONSTRAINT "shopping_list_restore_point_items_food_id_food_items_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_restore_points" ADD CONSTRAINT "shopping_list_restore_points_list_id_shopping_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."shopping_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_restore_points" ADD CONSTRAINT "shopping_list_restore_points_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shopping_list_restore_point_items_point_position_idx" ON "shopping_list_restore_point_items" USING btree ("restore_point_id","position","id");--> statement-breakpoint
CREATE INDEX "shopping_list_restore_point_items_recipe_idx" ON "shopping_list_restore_point_items" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "shopping_list_restore_point_items_food_idx" ON "shopping_list_restore_point_items" USING btree ("food_id");--> statement-breakpoint
CREATE INDEX "shopping_list_restore_points_list_created_idx" ON "shopping_list_restore_points" USING btree ("list_id","created_at","id");--> statement-breakpoint
CREATE INDEX "shopping_list_restore_points_user_idx" ON "shopping_list_restore_points" USING btree ("user_id");