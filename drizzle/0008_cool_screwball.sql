DROP INDEX "recipes_slug_idx";--> statement-breakpoint
-- Deduplicate any pre-existing slug collisions before enforcing uniqueness.
-- Keep the earliest row per slug untouched; suffix every other colliding row
-- with its globally-unique id so each slug becomes distinct while still fitting
-- the varchar(96) column (71 + 1 + 24 = 96).
UPDATE "recipes" AS r
SET "slug" = left(r."slug", 71) || '-' || r."id"
FROM (
	SELECT "id",
		row_number() OVER (
			PARTITION BY "slug"
			ORDER BY "created_at", "id"
		) AS rn
	FROM "recipes"
) AS d
WHERE r."id" = d."id" AND d.rn > 1;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_slug_uq" UNIQUE("slug");