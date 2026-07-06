CREATE TABLE "cook_log_entries" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"recipe_id" varchar(24) NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"cooked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	"photo_url" varchar(2048),
	"servings_made" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cook_log_entries" ADD CONSTRAINT "cook_log_entries_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cook_log_entries" ADD CONSTRAINT "cook_log_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cook_log_entries_recipe_idx" ON "cook_log_entries" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "cook_log_entries_user_idx" ON "cook_log_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cook_log_entries_user_cooked_idx" ON "cook_log_entries" USING btree ("user_id","cooked_at");