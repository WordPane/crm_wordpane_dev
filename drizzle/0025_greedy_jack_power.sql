ALTER TYPE "public"."quote_status" ADD VALUE 'requested';--> statement-breakpoint
CREATE TABLE "service_team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "quote_id" uuid;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "service_id" uuid;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "desired_deadline" date;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "quote_request_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "project_template_id" uuid;--> statement-breakpoint
ALTER TABLE "service_team_members" ADD CONSTRAINT "service_team_members_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_team_members" ADD CONSTRAINT "service_team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "service_team_members_unique" ON "service_team_members" USING btree ("service_id","user_id");--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_project_template_id_project_templates_id_fk" FOREIGN KEY ("project_template_id") REFERENCES "public"."project_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_quote_idx" ON "attachments" USING btree ("quote_id");