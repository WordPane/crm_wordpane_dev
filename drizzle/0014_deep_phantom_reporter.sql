CREATE TYPE "public"."quote_discount_type" AS ENUM('amount', 'percent');--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "discount_type" "quote_discount_type" DEFAULT 'amount' NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "discount_percent_bps" integer DEFAULT 0 NOT NULL;