ALTER TABLE "project_plans" DROP CONSTRAINT "project_plans_project_id_projects_id_fk";
--> statement-breakpoint
INSERT INTO "project_plan_projects" ("project_plan_id", "project_id") SELECT "id", "project_id" FROM "project_plans" WHERE "project_id" IS NOT NULL ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "project_plans" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "project_plans" DROP COLUMN "project_id";