CREATE TYPE "public"."tag_category" AS ENUM('meal', 'cuisine', 'dietary', 'general');--> statement-breakpoint
ALTER TABLE "tags" ALTER COLUMN "slug" SET DATA TYPE varchar(80);--> statement-breakpoint
ALTER TABLE "tags" ALTER COLUMN "name" SET DATA TYPE varchar(80);--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "category" "tag_category" DEFAULT 'general' NOT NULL;--> statement-breakpoint
UPDATE "tags"
SET
  "category" = CASE
    WHEN "slug" IN ('breakfast', 'brunch', 'lunch', 'dinner', 'appetizer', 'main-course', 'side-dish', 'soup', 'salad', 'dessert', 'snack', 'drink', 'bread', 'sauce') THEN 'meal'::"tag_category"
    WHEN "slug" IN ('american', 'british', 'cajun-creole', 'caribbean', 'chinese', 'eastern-european', 'ethiopian', 'filipino', 'french', 'german', 'greek', 'indian', 'indonesian', 'irish', 'italian', 'japanese', 'jewish', 'korean', 'latin-american', 'lebanese', 'malaysian', 'mediterranean', 'mexican', 'middle-eastern', 'moroccan', 'persian', 'russian', 'scandinavian', 'southern', 'spanish', 'tex-mex', 'thai', 'turkish', 'vietnamese') THEN 'cuisine'::"tag_category"
    WHEN "slug" IN ('vegan', 'vegetarian', 'dairy-free', 'gluten-free', 'egg-free', 'nut-free', 'soy-free', 'shellfish-free', 'fish-free', 'sesame-free') THEN 'dietary'::"tag_category"
    ELSE 'general'::"tag_category"
  END,
  "name" = CASE "slug"
    WHEN 'main-course' THEN 'Main Course'
    WHEN 'side-dish' THEN 'Side Dish'
    WHEN 'drink' THEN 'Drinks'
    WHEN 'cajun-creole' THEN 'Cajun & Creole'
    WHEN 'eastern-european' THEN 'Eastern European'
    WHEN 'latin-american' THEN 'Latin American'
    WHEN 'middle-eastern' THEN 'Middle Eastern'
    WHEN 'tex-mex' THEN 'Tex-Mex'
    WHEN 'gluten-free' THEN 'Gluten-Free'
    WHEN 'dairy-free' THEN 'Dairy-Free'
    WHEN 'egg-free' THEN 'Egg-Free'
    WHEN 'nut-free' THEN 'Nut-Free'
    WHEN 'soy-free' THEN 'Soy-Free'
    WHEN 'shellfish-free' THEN 'Shellfish-Free'
    WHEN 'fish-free' THEN 'Fish-Free'
    WHEN 'sesame-free' THEN 'Sesame-Free'
    WHEN "slug" IN (
      'breakfast', 'brunch', 'lunch', 'dinner', 'appetizer', 'soup', 'salad',
      'dessert', 'snack', 'bread', 'sauce', 'american', 'british', 'caribbean',
      'chinese', 'ethiopian', 'filipino', 'french', 'german', 'greek', 'indian',
      'indonesian', 'irish', 'italian', 'japanese', 'jewish', 'korean',
      'lebanese', 'malaysian', 'mediterranean', 'mexican', 'moroccan', 'persian',
      'russian', 'scandinavian', 'southern', 'spanish', 'thai', 'turkish',
      'vietnamese', 'vegan', 'vegetarian', 'weeknight', 'quick', 'barbecue',
      'healthy', 'holiday'
    ) THEN initcap(lower("name"))
    WHEN 'slow-cooker' THEN 'Slow Cooker'
    WHEN 'instant-pot' THEN 'Instant Pot'
    WHEN 'one-pot' THEN 'One-Pot'
    WHEN 'kid-friendly' THEN 'Kid-Friendly'
    WHEN 'comfort-food' THEN 'Comfort Food'
    WHEN 'low-carb' THEN 'Low-Carb'
    WHEN 'meal-prep' THEN 'Meal Prep'
    ELSE "name"
  END;--> statement-breakpoint
CREATE TEMP TABLE "_classification_aliases" (
  "alias_slug" varchar(80) PRIMARY KEY,
  "canonical_slug" varchar(80) NOT NULL,
  "canonical_name" varchar(80) NOT NULL,
  "category" "tag_category" NOT NULL
) ON COMMIT DROP;--> statement-breakpoint
INSERT INTO "_classification_aliases" ("alias_slug", "canonical_slug", "canonical_name", "category") VALUES
  ('veggie', 'vegetarian', 'Vegetarian', 'dietary'),
  ('vegetarians', 'vegetarian', 'Vegetarian', 'dietary'),
  ('vegans', 'vegan', 'Vegan', 'dietary'),
  ('plant-based', 'vegan', 'Vegan', 'dietary'),
  ('gf', 'gluten-free', 'Gluten-Free', 'dietary'),
  ('glutenfree', 'gluten-free', 'Gluten-Free', 'dietary'),
  ('df', 'dairy-free', 'Dairy-Free', 'dietary'),
  ('dairyfree', 'dairy-free', 'Dairy-Free', 'dietary'),
  ('non-dairy', 'dairy-free', 'Dairy-Free', 'dietary'),
  ('eggfree', 'egg-free', 'Egg-Free', 'dietary'),
  ('nutfree', 'nut-free', 'Nut-Free', 'dietary'),
  ('soyfree', 'soy-free', 'Soy-Free', 'dietary'),
  ('shellfishfree', 'shellfish-free', 'Shellfish-Free', 'dietary'),
  ('fishfree', 'fish-free', 'Fish-Free', 'dietary'),
  ('sesamefree', 'sesame-free', 'Sesame-Free', 'dietary'),
  ('breakfasts', 'breakfast', 'Breakfast', 'meal'),
  ('lunches', 'lunch', 'Lunch', 'meal'),
  ('dinners', 'dinner', 'Dinner', 'meal'),
  ('supper', 'dinner', 'Dinner', 'meal'),
  ('suppers', 'dinner', 'Dinner', 'meal'),
  ('appetizers', 'appetizer', 'Appetizer', 'meal'),
  ('starter', 'appetizer', 'Appetizer', 'meal'),
  ('starters', 'appetizer', 'Appetizer', 'meal'),
  ('mains', 'main-course', 'Main Course', 'meal'),
  ('main-dish', 'main-course', 'Main Course', 'meal'),
  ('entree', 'main-course', 'Main Course', 'meal'),
  ('entr-e', 'main-course', 'Main Course', 'meal'),
  ('sides', 'side-dish', 'Side Dish', 'meal'),
  ('soups', 'soup', 'Soup', 'meal'),
  ('salads', 'salad', 'Salad', 'meal'),
  ('desserts', 'dessert', 'Dessert', 'meal'),
  ('sweets', 'dessert', 'Dessert', 'meal'),
  ('puddings', 'dessert', 'Dessert', 'meal'),
  ('snacks', 'snack', 'Snack', 'meal'),
  ('drinks', 'drink', 'Drinks', 'meal'),
  ('beverage', 'drink', 'Drinks', 'meal'),
  ('beverages', 'drink', 'Drinks', 'meal'),
  ('cocktail', 'drink', 'Drinks', 'meal'),
  ('cocktails', 'drink', 'Drinks', 'meal'),
  ('breads', 'bread', 'Bread', 'meal'),
  ('sauces', 'sauce', 'Sauce', 'meal'),
  ('condiment', 'sauce', 'Sauce', 'meal'),
  ('condiments', 'sauce', 'Sauce', 'meal'),
  ('usa', 'american', 'American', 'cuisine'),
  ('u-s', 'american', 'American', 'cuisine'),
  ('united-states', 'american', 'American', 'cuisine'),
  ('english', 'british', 'British', 'cuisine'),
  ('cajun', 'cajun-creole', 'Cajun & Creole', 'cuisine'),
  ('creole', 'cajun-creole', 'Cajun & Creole', 'cuisine'),
  ('philippine', 'filipino', 'Filipino', 'cuisine'),
  ('pinoy', 'filipino', 'Filipino', 'cuisine'),
  ('iranian', 'persian', 'Persian', 'cuisine'),
  ('nordic', 'scandinavian', 'Scandinavian', 'cuisine'),
  ('southern-us', 'southern', 'Southern', 'cuisine'),
  ('southern-american', 'southern', 'Southern', 'cuisine'),
  ('texmex', 'tex-mex', 'Tex-Mex', 'cuisine'),
  ('week-night', 'weeknight', 'Weeknight', 'general'),
  ('weeknights', 'weeknight', 'Weeknight', 'general'),
  ('fast', 'quick', 'Quick', 'general'),
  ('speedy', 'quick', 'Quick', 'general'),
  ('quick-and-easy', 'quick', 'Quick', 'general'),
  ('bbq', 'barbecue', 'Barbecue', 'general'),
  ('barbeque', 'barbecue', 'Barbecue', 'general'),
  ('bar-b-q', 'barbecue', 'Barbecue', 'general'),
  ('crockpot', 'slow-cooker', 'Slow Cooker', 'general'),
  ('crock-pot', 'slow-cooker', 'Slow Cooker', 'general'),
  ('slowcooker', 'slow-cooker', 'Slow Cooker', 'general'),
  ('instapot', 'instant-pot', 'Instant Pot', 'general'),
  ('instantpot', 'instant-pot', 'Instant Pot', 'general'),
  ('onepot', 'one-pot', 'One-Pot', 'general'),
  ('one-pan', 'one-pot', 'One-Pot', 'general'),
  ('family-friendly', 'kid-friendly', 'Kid-Friendly', 'general'),
  ('wholesome', 'healthy', 'Healthy', 'general'),
  ('comfort', 'comfort-food', 'Comfort Food', 'general'),
  ('lowcarb', 'low-carb', 'Low-Carb', 'general'),
  ('mealprep', 'meal-prep', 'Meal Prep', 'general'),
  ('holidays', 'holiday', 'Holiday', 'general');--> statement-breakpoint
INSERT INTO "tags" ("id", "slug", "name", "category")
SELECT
  'ta_' || left(md5("canonical_slug"), 21),
  "canonical_slug",
  "canonical_name",
  "category"
FROM "_classification_aliases"
ON CONFLICT ("slug") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "category" = EXCLUDED."category";--> statement-breakpoint
INSERT INTO "recipe_tags" ("recipe_id", "tag_id")
SELECT "recipe_tags"."recipe_id", "canonical_tags"."id"
FROM "recipe_tags"
JOIN "tags" AS "alias_tags" ON "alias_tags"."id" = "recipe_tags"."tag_id"
JOIN "_classification_aliases" ON "_classification_aliases"."alias_slug" = "alias_tags"."slug"
JOIN "tags" AS "canonical_tags" ON "canonical_tags"."slug" = "_classification_aliases"."canonical_slug"
ON CONFLICT DO NOTHING;--> statement-breakpoint
DELETE FROM "recipe_tags"
USING "tags", "_classification_aliases"
WHERE
  "recipe_tags"."tag_id" = "tags"."id"
  AND "tags"."slug" = "_classification_aliases"."alias_slug";--> statement-breakpoint
DELETE FROM "tags"
USING "_classification_aliases"
WHERE "tags"."slug" = "_classification_aliases"."alias_slug";--> statement-breakpoint
WITH legacy_cuisines AS (
  SELECT DISTINCT ON (slug)
    'tc_' || left(md5(slug), 21) AS id,
    slug,
    left(btrim(cuisine), 80) AS name
  FROM (
    SELECT
      cuisine,
      left(
        COALESCE(
          NULLIF(btrim(both '-' from regexp_replace(lower(btrim(cuisine)), '[^a-z0-9]+', '-', 'g')), ''),
          lower(btrim(cuisine))
        ),
        80
      ) AS slug
    FROM recipes
    WHERE cuisine IS NOT NULL AND btrim(cuisine) <> ''
  ) normalized_cuisines
  WHERE slug <> ''
  ORDER BY slug, name
)
INSERT INTO tags (id, slug, name, category)
SELECT id, slug, name, 'cuisine'::"tag_category"
FROM legacy_cuisines
ON CONFLICT (slug) DO NOTHING;--> statement-breakpoint
INSERT INTO recipe_tags (recipe_id, tag_id)
SELECT recipes.id, tags.id
FROM recipes
JOIN tags ON tags.slug = left(
  COALESCE(
    NULLIF(btrim(both '-' from regexp_replace(lower(btrim(recipes.cuisine)), '[^a-z0-9]+', '-', 'g')), ''),
    lower(btrim(recipes.cuisine))
  ),
  80
)
WHERE recipes.cuisine IS NOT NULL AND btrim(recipes.cuisine) <> ''
ON CONFLICT DO NOTHING;--> statement-breakpoint
CREATE INDEX "recipe_tags_tag_idx" ON "recipe_tags" USING btree ("tag_id","recipe_id");--> statement-breakpoint
CREATE INDEX "tags_category_name_idx" ON "tags" USING btree ("category","name");