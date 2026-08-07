ALTER TABLE "meal_plan_entries" ADD COLUMN "planned_servings" integer;--> statement-breakpoint
ALTER TABLE "meal_plan_entries" ADD COLUMN "servings_made" integer;--> statement-breakpoint
ALTER TABLE "meal_plan_entries" ADD COLUMN "leftover_source_id" varchar(24);--> statement-breakpoint
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_leftover_source_id_meal_plan_entries_id_fk" FOREIGN KEY ("leftover_source_id") REFERENCES "public"."meal_plan_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meal_plan_entries_leftover_source_idx" ON "meal_plan_entries" USING btree ("leftover_source_id");--> statement-breakpoint
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_planned_servings_check" CHECK ("meal_plan_entries"."planned_servings" is null or "meal_plan_entries"."planned_servings" > 0);--> statement-breakpoint
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_servings_made_check" CHECK ("meal_plan_entries"."servings_made" is null or "meal_plan_entries"."servings_made" > 0);--> statement-breakpoint
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_servings_allocation_check" CHECK ("meal_plan_entries"."servings_made" is null or "meal_plan_entries"."planned_servings" is null or "meal_plan_entries"."servings_made" >= "meal_plan_entries"."planned_servings");