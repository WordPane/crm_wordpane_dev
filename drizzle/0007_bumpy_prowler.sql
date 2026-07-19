CREATE TYPE "public"."charge_billing_type" AS ENUM('pix', 'boleto', 'credit_card', 'undefined');--> statement-breakpoint
CREATE TYPE "public"."charge_status" AS ENUM('pending', 'confirmed', 'received', 'overdue', 'refunded', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."service_billing" AS ENUM('one_time', 'recurring');--> statement-breakpoint
CREATE TYPE "public"."subscription_cycle" AS ENUM('weekly', 'monthly', 'quarterly', 'semiannually', 'yearly');--> statement-breakpoint
CREATE TABLE "charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"quote_id" uuid,
	"company_service_id" uuid,
	"description" text NOT NULL,
	"value_cents" integer NOT NULL,
	"billing_type" charge_billing_type NOT NULL,
	"due_date" date NOT NULL,
	"status" charge_status DEFAULT 'pending' NOT NULL,
	"asaas_payment_id" varchar(40),
	"invoice_url" text,
	"bank_slip_url" text,
	"paid_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"value_cents" integer NOT NULL,
	"billing_type" charge_billing_type NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"asaas_subscription_id" varchar(40),
	"cancelled_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"default_value_cents" integer NOT NULL,
	"billing" "service_billing" DEFAULT 'one_time' NOT NULL,
	"cycle" "subscription_cycle" DEFAULT 'monthly' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "asaas_customer_id" varchar(40);--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_company_service_id_company_services_id_fk" FOREIGN KEY ("company_service_id") REFERENCES "public"."company_services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_services" ADD CONSTRAINT "company_services_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_services" ADD CONSTRAINT "company_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_services" ADD CONSTRAINT "company_services_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "charges_asaas_payment_key" ON "charges" USING btree ("asaas_payment_id");--> statement-breakpoint
CREATE INDEX "charges_company_idx" ON "charges" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "charges_status_idx" ON "charges" USING btree ("status");--> statement-breakpoint
CREATE INDEX "charges_due_idx" ON "charges" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "company_services_company_idx" ON "company_services" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "company_services_service_idx" ON "company_services" USING btree ("service_id");