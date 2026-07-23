ALTER TABLE "charges" ADD COLUMN "project_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "project_plans" ADD COLUMN "billing_mode" varchar(20) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_plans" ADD COLUMN "asaas_subscription_id" varchar(40);--> statement-breakpoint
ALTER TABLE "project_plans" ADD COLUMN "last_billed_period_start" date;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_project_plan_id_project_plans_id_fk" FOREIGN KEY ("project_plan_id") REFERENCES "public"."project_plans"("id") ON DELETE set null ON UPDATE no action;