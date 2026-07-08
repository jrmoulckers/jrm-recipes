-- Repair dangling self-references before enforcing the FK: null out any
-- "parent_id" that points at a comment row which no longer exists, so adding the
-- constraint can't fail on pre-existing orphaned replies. Orphans were possible
-- because "parent_id" had no foreign key until now.
UPDATE "comments" AS c
SET "parent_id" = NULL
WHERE c."parent_id" IS NOT NULL
	AND NOT EXISTS (
		SELECT 1 FROM "comments" AS p WHERE p."id" = c."parent_id"
	);--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;