CREATE TYPE "public"."recipe_creator_role" AS ENUM('creator');--> statement-breakpoint
CREATE TYPE "public"."recipe_creator_status" AS ENUM('pending', 'accepted');--> statement-breakpoint
CREATE TABLE "recipe_creators" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"recipe_id" varchar(24) NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"role" "recipe_creator_role" DEFAULT 'creator' NOT NULL,
	"status" "recipe_creator_status" DEFAULT 'pending' NOT NULL,
	"slug" varchar(96),
	"invited_by_id" varchar(24),
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_creators_recipe_user_uq" UNIQUE("recipe_id","user_id"),
	CONSTRAINT "recipe_creators_user_slug_uq" UNIQUE("user_id","slug"),
	CONSTRAINT "recipe_creators_status_check" CHECK (("recipe_creators"."status" = 'accepted' and "recipe_creators"."slug" is not null and "recipe_creators"."accepted_at" is not null) or ("recipe_creators"."status" = 'pending' and "recipe_creators"."slug" is null and "recipe_creators"."accepted_at" is null))
);
--> statement-breakpoint
ALTER TABLE "recipe_creators" ADD CONSTRAINT "recipe_creators_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_creators" ADD CONSTRAINT "recipe_creators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_creators" ADD CONSTRAINT "recipe_creators_invited_by_id_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_creators_user_idx" ON "recipe_creators" USING btree ("user_id") WHERE "recipe_creators"."status" = 'accepted';--> statement-breakpoint
CREATE INDEX "recipe_creators_recipe_idx" ON "recipe_creators" USING btree ("recipe_id") WHERE "recipe_creators"."status" = 'accepted';--> statement-breakpoint
CREATE INDEX "recipe_creators_invited_by_idx" ON "recipe_creators" USING btree ("invited_by_id");