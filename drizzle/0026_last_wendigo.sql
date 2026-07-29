CREATE TYPE "public"."measurement_system" AS ENUM('us', 'metric');--> statement-breakpoint
CREATE TYPE "public"."unit_dimension" AS ENUM('volume', 'mass', 'count', 'temperature');--> statement-breakpoint
CREATE TABLE "custom_units" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"name" varchar(40) NOT NULL,
	"abbreviation" varchar(20),
	"dimension" "unit_dimension" NOT NULL,
	"base_unit" varchar(40),
	"base_amount" real,
	"display_as_true" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_units_user_name_uq" UNIQUE("user_id","name"),
	CONSTRAINT "custom_units_base_amount_check" CHECK ("custom_units"."base_amount" is null or "custom_units"."base_amount" > 0),
	CONSTRAINT "custom_units_base_pair_check" CHECK (("custom_units"."base_unit" is null and "custom_units"."base_amount" is null) or ("custom_units"."base_unit" is not null and "custom_units"."base_amount" is not null))
);
--> statement-breakpoint
CREATE TABLE "user_unit_preferences" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"default_system" "measurement_system" DEFAULT 'metric' NOT NULL,
	"volume_unit" varchar(40),
	"mass_unit" varchar(40),
	"temperature_unit" varchar(40),
	"auto_convert" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_unit_preferences_user_uq" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "custom_units" ADD CONSTRAINT "custom_units_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_unit_preferences" ADD CONSTRAINT "user_unit_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_units_user_idx" ON "custom_units" USING btree ("user_id");