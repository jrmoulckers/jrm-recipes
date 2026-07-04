CREATE TYPE "public"."comment_kind" AS ENUM('comment', 'suggestion');--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "kind" "comment_kind" DEFAULT 'comment' NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "resolved_at" timestamp with time zone;