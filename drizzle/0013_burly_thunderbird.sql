CREATE TABLE "member_dietary_profiles" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"group_id" varchar(24),
	"name" varchar(80) NOT NULL,
	"allergens" text[],
	"diets" text[],
	"calorie_goal" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_dietary_profiles" ADD CONSTRAINT "member_dietary_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_dietary_profiles" ADD CONSTRAINT "member_dietary_profiles_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_dietary_profiles_user_idx" ON "member_dietary_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "member_dietary_profiles_group_idx" ON "member_dietary_profiles" USING btree ("group_id");