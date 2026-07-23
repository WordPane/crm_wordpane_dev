CREATE TABLE "project_plan_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_plan_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "project_plans_project_unique";--> statement-breakpoint
ALTER TABLE "project_plans" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project_plan_usages" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "project_plans" ADD COLUMN "company_id" uuid;--> statement-breakpoint
UPDATE "project_plans" SET "company_id" = "projects"."company_id" FROM "projects" WHERE "project_plans"."project_id" = "projects"."id";--> statement-breakpoint
ALTER TABLE "project_plan_projects" ADD CONSTRAINT "project_plan_projects_project_plan_id_project_plans_id_fk" FOREIGN KEY ("project_plan_id") REFERENCES "public"."project_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_plan_projects" ADD CONSTRAINT "project_plan_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_plan_projects_unique" ON "project_plan_projects" USING btree ("project_plan_id","project_id");--> statement-breakpoint
CREATE INDEX "project_plan_projects_project_idx" ON "project_plan_projects" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "project_plan_usages" ADD CONSTRAINT "project_plan_usages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_plans" ADD CONSTRAINT "project_plans_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_plans_company_idx" ON "project_plans" USING btree ("company_id");