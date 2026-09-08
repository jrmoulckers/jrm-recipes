CREATE TABLE "custom_dietary_restriction_terms" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"restriction_id" varchar(24) NOT NULL,
	"term" varchar(300) NOT NULL,
	"source" varchar(16) NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_dietary_restriction_terms_restriction_term_uq" UNIQUE("restriction_id","term"),
	CONSTRAINT "custom_dietary_restriction_terms_source_check" CHECK ("custom_dietary_restriction_terms"."source" in ('exact', 'suggested')),
	CONSTRAINT "custom_dietary_restriction_terms_exact_approved_check" CHECK ("custom_dietary_restriction_terms"."source" <> 'exact' or "custom_dietary_restriction_terms"."approved" = true)
);
--> statement-breakpoint
CREATE TABLE "custom_dietary_restrictions" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"profile_id" varchar(24) NOT NULL,
	"name" varchar(80) NOT NULL,
	"severity" varchar(24) NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_dietary_restrictions_id_profile_uq" UNIQUE("id","profile_id"),
	CONSTRAINT "custom_dietary_restrictions_profile_name_uq" UNIQUE("profile_id","name"),
	CONSTRAINT "custom_dietary_restrictions_severity_check" CHECK ("custom_dietary_restrictions"."severity" in ('allergy-intolerance', 'strict-avoidance', 'preference'))
);
--> statement-breakpoint
CREATE TABLE "dietary_assessments" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"recipe_id" varchar(24) NOT NULL,
	"rule_id" varchar(80),
	"custom_restriction_id" varchar(24),
	"scope" varchar(16) NOT NULL,
	"owner_user_id" varchar(24),
	"profile_id" varchar(24),
	"source" varchar(24) NOT NULL,
	"verdict" varchar(16) NOT NULL,
	"confidence" varchar(16),
	"ingredient_fingerprint" varchar(80) NOT NULL,
	"analyzer_version" varchar(80) NOT NULL,
	"ruleset_version" varchar(80) NOT NULL,
	"restriction_terms_version" varchar(80),
	"created_by_id" varchar(24),
	"invalidated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dietary_assessments_rule_target_check" CHECK (num_nonnulls("dietary_assessments"."rule_id", "dietary_assessments"."custom_restriction_id") = 1),
	CONSTRAINT "dietary_assessments_scope_check" CHECK ((
        ("dietary_assessments"."scope" = 'canonical' and "dietary_assessments"."owner_user_id" is null and "dietary_assessments"."profile_id" is null)
        or ("dietary_assessments"."scope" = 'personal' and "dietary_assessments"."owner_user_id" is not null and "dietary_assessments"."profile_id" is null)
        or ("dietary_assessments"."scope" = 'profile' and "dietary_assessments"."owner_user_id" is null and "dietary_assessments"."profile_id" is not null)
      )),
	CONSTRAINT "dietary_assessments_custom_scope_check" CHECK ("dietary_assessments"."custom_restriction_id" is null or "dietary_assessments"."scope" = 'profile'),
	CONSTRAINT "dietary_assessments_restriction_terms_version_check" CHECK (("dietary_assessments"."custom_restriction_id" is null and "dietary_assessments"."restriction_terms_version" is null)
        or ("dietary_assessments"."custom_restriction_id" is not null and "dietary_assessments"."restriction_terms_version" is not null)),
	CONSTRAINT "dietary_assessments_source_check" CHECK ("dietary_assessments"."source" in ('deterministic', 'on-device', 'author-confirmed')),
	CONSTRAINT "dietary_assessments_outcome_check" CHECK ((
        ("dietary_assessments"."source" = 'author-confirmed' and "dietary_assessments"."verdict" = 'meets' and "dietary_assessments"."confidence" is null)
        or
        ("dietary_assessments"."source" <> 'author-confirmed' and (
          ("dietary_assessments"."verdict" = 'meets' and "dietary_assessments"."confidence" in ('high', 'medium'))
          or ("dietary_assessments"."verdict" = 'unknown' and "dietary_assessments"."confidence" = 'needs-review')
          or ("dietary_assessments"."verdict" = 'conflicts' and "dietary_assessments"."confidence" = 'high')
        ))
      ))
);
--> statement-breakpoint
CREATE TABLE "dietary_evidence" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"assessment_id" varchar(24) NOT NULL,
	"ingredient_id" varchar(24) NOT NULL,
	"finding" varchar(16) NOT NULL,
	"source" varchar(24) NOT NULL,
	"material" boolean DEFAULT true NOT NULL,
	"food_id" varchar(24),
	"correction_id" varchar(24),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dietary_evidence_assessment_ingredient_source_finding_uq" UNIQUE("assessment_id","ingredient_id","source","finding"),
	CONSTRAINT "dietary_evidence_finding_check" CHECK ("dietary_evidence"."finding" in ('present', 'absent', 'possible', 'unresolved')),
	CONSTRAINT "dietary_evidence_source_check" CHECK ("dietary_evidence"."source" in ('food-link', 'text-match', 'on-device', 'author-confirmed', 'ingredient-correction', 'certification')),
	CONSTRAINT "dietary_evidence_correction_source_check" CHECK (("dietary_evidence"."source" = 'ingredient-correction') = ("dietary_evidence"."correction_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "dietary_ingredient_corrections" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"ingredient_id" varchar(24) NOT NULL,
	"rule_id" varchar(80),
	"custom_restriction_id" varchar(24),
	"finding" varchar(16) NOT NULL,
	"corrected_food_id" varchar(24),
	"actor_id" varchar(24),
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dietary_ingredient_corrections_rule_target_check" CHECK (num_nonnulls("dietary_ingredient_corrections"."rule_id", "dietary_ingredient_corrections"."custom_restriction_id") = 1),
	CONSTRAINT "dietary_ingredient_corrections_finding_check" CHECK ("dietary_ingredient_corrections"."finding" in ('present', 'absent', 'possible', 'unresolved'))
);
--> statement-breakpoint
CREATE TABLE "dietary_rules" (
	"id" varchar(80) PRIMARY KEY NOT NULL,
	"kind" varchar(24) NOT NULL,
	"ruleset_version" varchar(80) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dietary_rules_kind_check" CHECK ("dietary_rules"."kind" in ('allergen', 'composition', 'confirmation-only'))
);
--> statement-breakpoint
-- Initial built-in dietary registry for ADR-0011 phase 1/2 (#1101).
INSERT INTO "dietary_rules" ("id", "kind", "ruleset_version") VALUES
	('allergen:peanut', 'allergen', 'd1.1uup4zau9ot5n'),
	('allergen:tree-nut', 'allergen', 'd1.1uup4zau9ot5n'),
	('allergen:dairy', 'allergen', 'd1.1uup4zau9ot5n'),
	('allergen:egg', 'allergen', 'd1.1uup4zau9ot5n'),
	('allergen:soy', 'allergen', 'd1.1uup4zau9ot5n'),
	('allergen:wheat', 'allergen', 'd1.1uup4zau9ot5n'),
	('allergen:fish', 'allergen', 'd1.1uup4zau9ot5n'),
	('allergen:shellfish', 'allergen', 'd1.1uup4zau9ot5n'),
	('allergen:sesame', 'allergen', 'd1.1uup4zau9ot5n'),
	('composition:vegan', 'composition', 'd1.1uup4zau9ot5n'),
	('composition:vegetarian', 'composition', 'd1.1uup4zau9ot5n'),
	('composition:pescatarian', 'composition', 'd1.1uup4zau9ot5n'),
	('confirmation:celiac-safe', 'confirmation-only', 'd1.1uup4zau9ot5n'),
	('confirmation:kosher', 'confirmation-only', 'd1.1uup4zau9ot5n'),
	('confirmation:halal', 'confirmation-only', 'd1.1uup4zau9ot5n');
--> statement-breakpoint
ALTER TABLE "custom_dietary_restriction_terms" ADD CONSTRAINT "custom_dietary_restriction_terms_restriction_id_custom_dietary_restrictions_id_fk" FOREIGN KEY ("restriction_id") REFERENCES "public"."custom_dietary_restrictions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_dietary_restrictions" ADD CONSTRAINT "custom_dietary_restrictions_profile_id_member_dietary_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."member_dietary_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dietary_assessments" ADD CONSTRAINT "dietary_assessments_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dietary_assessments" ADD CONSTRAINT "dietary_assessments_rule_id_dietary_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."dietary_rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dietary_assessments" ADD CONSTRAINT "dietary_assessments_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dietary_assessments" ADD CONSTRAINT "dietary_assessments_profile_id_member_dietary_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."member_dietary_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dietary_assessments" ADD CONSTRAINT "dietary_assessments_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dietary_assessments" ADD CONSTRAINT "dietary_assessments_custom_restriction_profile_fk" FOREIGN KEY ("custom_restriction_id","profile_id") REFERENCES "public"."custom_dietary_restrictions"("id","profile_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dietary_evidence" ADD CONSTRAINT "dietary_evidence_assessment_id_dietary_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."dietary_assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dietary_evidence" ADD CONSTRAINT "dietary_evidence_ingredient_id_recipe_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."recipe_ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dietary_evidence" ADD CONSTRAINT "dietary_evidence_food_id_food_items_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dietary_evidence" ADD CONSTRAINT "dietary_evidence_correction_id_dietary_ingredient_corrections_id_fk" FOREIGN KEY ("correction_id") REFERENCES "public"."dietary_ingredient_corrections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dietary_ingredient_corrections" ADD CONSTRAINT "dietary_ingredient_corrections_ingredient_id_recipe_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."recipe_ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dietary_ingredient_corrections" ADD CONSTRAINT "dietary_ingredient_corrections_rule_id_dietary_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."dietary_rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dietary_ingredient_corrections" ADD CONSTRAINT "dietary_ingredient_corrections_custom_restriction_id_custom_dietary_restrictions_id_fk" FOREIGN KEY ("custom_restriction_id") REFERENCES "public"."custom_dietary_restrictions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dietary_ingredient_corrections" ADD CONSTRAINT "dietary_ingredient_corrections_corrected_food_id_food_items_id_fk" FOREIGN KEY ("corrected_food_id") REFERENCES "public"."food_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dietary_ingredient_corrections" ADD CONSTRAINT "dietary_ingredient_corrections_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_dietary_restriction_terms_restriction_idx" ON "custom_dietary_restriction_terms" USING btree ("restriction_id");--> statement-breakpoint
CREATE INDEX "custom_dietary_restrictions_profile_idx" ON "custom_dietary_restrictions" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "dietary_assessments_recipe_idx" ON "dietary_assessments" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "dietary_assessments_rule_idx" ON "dietary_assessments" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "dietary_assessments_custom_idx" ON "dietary_assessments" USING btree ("custom_restriction_id");--> statement-breakpoint
CREATE INDEX "dietary_assessments_owner_user_idx" ON "dietary_assessments" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "dietary_assessments_profile_idx" ON "dietary_assessments" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "dietary_assessments_created_by_idx" ON "dietary_assessments" USING btree ("created_by_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dietary_assessments_active_canonical_rule_source_uq" ON "dietary_assessments" USING btree ("recipe_id","rule_id","source","scope") WHERE "dietary_assessments"."rule_id" is not null and "dietary_assessments"."scope" = 'canonical' and "dietary_assessments"."invalidated_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "dietary_assessments_active_personal_rule_source_uq" ON "dietary_assessments" USING btree ("recipe_id","rule_id","source","scope","owner_user_id") WHERE "dietary_assessments"."rule_id" is not null and "dietary_assessments"."scope" = 'personal' and "dietary_assessments"."invalidated_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "dietary_assessments_active_profile_rule_source_uq" ON "dietary_assessments" USING btree ("recipe_id","rule_id","source","scope","profile_id") WHERE "dietary_assessments"."rule_id" is not null and "dietary_assessments"."scope" = 'profile' and "dietary_assessments"."invalidated_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "dietary_assessments_active_profile_custom_source_uq" ON "dietary_assessments" USING btree ("recipe_id","custom_restriction_id","source","scope","profile_id") WHERE "dietary_assessments"."custom_restriction_id" is not null and "dietary_assessments"."scope" = 'profile' and "dietary_assessments"."invalidated_at" is null;--> statement-breakpoint
CREATE INDEX "dietary_evidence_assessment_idx" ON "dietary_evidence" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "dietary_evidence_ingredient_idx" ON "dietary_evidence" USING btree ("ingredient_id");--> statement-breakpoint
CREATE INDEX "dietary_evidence_food_idx" ON "dietary_evidence" USING btree ("food_id");--> statement-breakpoint
CREATE INDEX "dietary_evidence_correction_idx" ON "dietary_evidence" USING btree ("correction_id");--> statement-breakpoint
CREATE INDEX "dietary_ingredient_corrections_ingredient_idx" ON "dietary_ingredient_corrections" USING btree ("ingredient_id");--> statement-breakpoint
CREATE INDEX "dietary_ingredient_corrections_rule_idx" ON "dietary_ingredient_corrections" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "dietary_ingredient_corrections_custom_idx" ON "dietary_ingredient_corrections" USING btree ("custom_restriction_id");--> statement-breakpoint
CREATE INDEX "dietary_ingredient_corrections_food_idx" ON "dietary_ingredient_corrections" USING btree ("corrected_food_id");--> statement-breakpoint
CREATE INDEX "dietary_ingredient_corrections_actor_idx" ON "dietary_ingredient_corrections" USING btree ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dietary_ingredient_corrections_active_rule_uq" ON "dietary_ingredient_corrections" USING btree ("ingredient_id","rule_id") WHERE "dietary_ingredient_corrections"."rule_id" is not null and "dietary_ingredient_corrections"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "dietary_ingredient_corrections_active_custom_uq" ON "dietary_ingredient_corrections" USING btree ("ingredient_id","custom_restriction_id") WHERE "dietary_ingredient_corrections"."custom_restriction_id" is not null and "dietary_ingredient_corrections"."revoked_at" is null;
--> statement-breakpoint
-- Legacy tags were derived from absence of a text match. Clear them rather than
-- carrying unsafe positive claims forward; the authorized recipe write path
-- repopulates only complete, high-confidence deterministic projections.
UPDATE "recipes" SET "dietary_tags" = NULL WHERE "dietary_tags" IS NOT NULL;