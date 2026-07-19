CREATE TYPE "public"."person_type" AS ENUM('pj', 'pf');--> statement-breakpoint
ALTER TABLE "client_registrations" ADD COLUMN "person_type" "person_type" DEFAULT 'pj' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "person_type" "person_type" DEFAULT 'pj' NOT NULL;