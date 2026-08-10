CREATE TYPE "public"."erasure_hold_reason" AS ENUM('co_created_entanglement');--> statement-breakpoint
CREATE TABLE "erasure_holds" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"trigger" "deletion_trigger" NOT NULL,
	"reason" "erasure_hold_reason" NOT NULL,
	"entangled_recipe_ids" jsonb NOT NULL,
	"request_count" integer DEFAULT 1 NOT NULL,
	"first_requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notice_version" varchar(40),
	"released_at" timestamp with time zone,
	CONSTRAINT "erasure_holds_userId_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "erasure_holds" ADD CONSTRAINT "erasure_holds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "erasure_holds_released_at_idx" ON "erasure_holds" USING btree ("released_at","first_requested_at");