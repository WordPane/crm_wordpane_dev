CREATE TYPE "public"."invoice_status" AS ENUM('scheduled', 'synchronized', 'authorized', 'error', 'canceled');--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"charge_id" uuid NOT NULL,
	"asaas_invoice_id" varchar(40),
	"status" "invoice_status" DEFAULT 'scheduled' NOT NULL,
	"number" varchar(40),
	"pdf_key" text,
	"xml_key" text,
	"asaas_pdf_url" text,
	"asaas_xml_url" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_charge_key" ON "invoices" USING btree ("charge_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");