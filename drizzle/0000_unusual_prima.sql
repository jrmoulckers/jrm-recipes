CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'member', 'kid');--> statement-breakpoint
CREATE TYPE "public"."recipe_difficulty" AS ENUM('easy', 'medium', 'hard');--> statement-breakpoint
CREATE TYPE "public"."recipe_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."recipe_visibility" AS ENUM('private', 'group', 'unlisted', 'public');--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"clerk_id" varchar(191),
	"email" varchar(320),
	"name" varchar(120),
	"handle" varchar(60),
	"avatar_url" varchar(2048),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerkId_unique" UNIQUE("clerk_id"),
	CONSTRAINT "users_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"group_id" varchar(24) NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_members_group_user_uq" UNIQUE("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" varchar(500),
	"avatar_url" varchar(2048),
	"created_by_id" varchar(24),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"recipe_id" varchar(24) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"section" varchar(120),
	"quantity" real,
	"quantity_max" real,
	"unit" varchar(40),
	"item" varchar(300) NOT NULL,
	"note" varchar(300),
	"optional" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_steps" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"recipe_id" varchar(24) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"section" varchar(120),
	"instruction" text NOT NULL,
	"image_url" varchar(2048),
	"video_url" varchar(2048),
	"timer_seconds" integer,
	"techniques" text[]
);
--> statement-breakpoint
CREATE TABLE "recipe_versions" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"recipe_id" varchar(24) NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"label" varchar(200),
	"summary" varchar(500),
	"snapshot" text NOT NULL,
	"author_id" varchar(24),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"slug" varchar(96) NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"cover_image_url" varchar(2048),
	"author_id" varchar(24) NOT NULL,
	"group_id" varchar(24),
	"visibility" "recipe_visibility" DEFAULT 'private' NOT NULL,
	"status" "recipe_status" DEFAULT 'draft' NOT NULL,
	"servings" integer DEFAULT 4,
	"servings_noun" varchar(40) DEFAULT 'servings',
	"prep_minutes" integer,
	"cook_minutes" integer,
	"total_minutes" integer,
	"difficulty" "recipe_difficulty",
	"cuisine" varchar(80),
	"source_name" varchar(200),
	"source_url" varchar(2048),
	"notes" text,
	"forked_from_id" varchar(24),
	"fork_note" varchar(300),
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"recipe_id" varchar(24) NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"parent_id" varchar(24),
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"recipe_id" varchar(24) NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"value" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ratings_recipe_user_uq" UNIQUE("recipe_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "recipe_tags" (
	"recipe_id" varchar(24) NOT NULL,
	"tag_id" varchar(24) NOT NULL,
	CONSTRAINT "recipe_tags_recipe_id_tag_id_pk" PRIMARY KEY("recipe_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"slug" varchar(60) NOT NULL,
	"name" varchar(60) NOT NULL,
	CONSTRAINT "tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_steps" ADD CONSTRAINT "recipe_steps_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_tags" ADD CONSTRAINT "recipe_tags_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_tags" ADD CONSTRAINT "recipe_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_clerk_id_idx" ON "users" USING btree ("clerk_id");--> statement-breakpoint
CREATE INDEX "group_members_user_idx" ON "group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "groups_slug_idx" ON "groups" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "recipe_ingredients_recipe_idx" ON "recipe_ingredients" USING btree ("recipe_id","position");--> statement-breakpoint
CREATE INDEX "recipe_steps_recipe_idx" ON "recipe_steps" USING btree ("recipe_id","position");--> statement-breakpoint
CREATE INDEX "recipe_versions_recipe_idx" ON "recipe_versions" USING btree ("recipe_id","version_number");--> statement-breakpoint
CREATE INDEX "recipes_author_idx" ON "recipes" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "recipes_group_idx" ON "recipes" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "recipes_visibility_idx" ON "recipes" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "recipes_slug_idx" ON "recipes" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "recipes_forked_from_idx" ON "recipes" USING btree ("forked_from_id");--> statement-breakpoint
CREATE INDEX "comments_recipe_idx" ON "comments" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "comments_parent_idx" ON "comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "ratings_recipe_idx" ON "ratings" USING btree ("recipe_id");