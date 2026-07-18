CREATE TYPE "public"."registration_status" AS ENUM('pendente', 'aprovado', 'recusado');--> statement-breakpoint
CREATE TABLE "client_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"razao_social" varchar(255) NOT NULL,
	"nome_fantasia" varchar(255),
	"cnpj" varchar(18),
	"telefone" varchar(20),
	"whatsapp" varchar(20),
	"email" varchar(255),
	"site" varchar(255),
	"cidade" varchar(120),
	"estado" varchar(2),
	"mensagem" text,
	"user_name" varchar(160) NOT NULL,
	"user_email" varchar(255) NOT NULL,
	"user_password_hash" text NOT NULL,
	"user_phone" varchar(20),
	"user_position" varchar(120),
	"status" "registration_status" DEFAULT 'pendente' NOT NULL,
	"review_note" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"approved_company_id" uuid,
	"approved_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_registrations" ADD CONSTRAINT "client_registrations_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_registrations" ADD CONSTRAINT "client_registrations_approved_company_id_companies_id_fk" FOREIGN KEY ("approved_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_registrations" ADD CONSTRAINT "client_registrations_approved_user_id_users_id_fk" FOREIGN KEY ("approved_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_registrations_status_created_idx" ON "client_registrations" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "client_registrations_user_email_idx" ON "client_registrations" USING btree ("user_email");