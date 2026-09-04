-- Contract phase for #1046/#1049. The versioned nutrition_targets table has
-- been deployed and its production backfill verified before removing the
-- legacy dual-written column.
ALTER TABLE "member_dietary_profiles" DROP COLUMN IF EXISTS "calorie_goal";