ALTER TABLE "quotes" ADD COLUMN "public_token" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "duplicated_from_id" uuid;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "responded_name" varchar(160);--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_duplicated_from_id_quotes_id_fk" FOREIGN KEY ("duplicated_from_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_public_token_key" ON "quotes" USING btree ("public_token");