ALTER TYPE "public"."demand_category" ADD VALUE 'nova_pagina' BEFORE 'outro';--> statement-breakpoint
CREATE TABLE "maintenance_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"adjustments" integer NOT NULL,
	"pages" integer NOT NULL,
	"value_cents" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"adjustments_limit" integer NOT NULL,
	"pages_limit" integer NOT NULL,
	"value_cents" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_plan_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_plan_id" uuid NOT NULL,
	"package_id" uuid,
	"name" varchar(160) NOT NULL,
	"adjustments" integer NOT NULL,
	"pages" integer NOT NULL,
	"value_cents" integer NOT NULL,
	"charge_id" uuid,
	"status" varchar(20) DEFAULT 'pending_payment' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_plan_usages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_plan_id" uuid NOT NULL,
	"demand_id" uuid NOT NULL,
	"kind" varchar(20) NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"current_period_start" date NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_plan_packages" ADD CONSTRAINT "project_plan_packages_project_plan_id_project_plans_id_fk" FOREIGN KEY ("project_plan_id") REFERENCES "public"."project_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_plan_packages" ADD CONSTRAINT "project_plan_packages_package_id_maintenance_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."maintenance_packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_plan_packages" ADD CONSTRAINT "project_plan_packages_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_plan_packages" ADD CONSTRAINT "project_plan_packages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_plan_usages" ADD CONSTRAINT "project_plan_usages_project_plan_id_project_plans_id_fk" FOREIGN KEY ("project_plan_id") REFERENCES "public"."project_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_plans" ADD CONSTRAINT "project_plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_plans" ADD CONSTRAINT "project_plans_plan_id_maintenance_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."maintenance_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_plans" ADD CONSTRAINT "project_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_plan_packages_plan_idx" ON "project_plan_packages" USING btree ("project_plan_id");--> statement-breakpoint
CREATE INDEX "project_plan_packages_charge_idx" ON "project_plan_packages" USING btree ("charge_id");--> statement-breakpoint
CREATE INDEX "project_plan_usages_plan_idx" ON "project_plan_usages" USING btree ("project_plan_id");--> statement-breakpoint
CREATE INDEX "project_plan_usages_demand_idx" ON "project_plan_usages" USING btree ("demand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_plans_project_unique" ON "project_plans" USING btree ("project_id");