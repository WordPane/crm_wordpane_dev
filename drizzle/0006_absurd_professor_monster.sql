ALTER TABLE "demands" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "demands" ADD CONSTRAINT "demands_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "demands_project_idx" ON "demands" USING btree ("project_id");