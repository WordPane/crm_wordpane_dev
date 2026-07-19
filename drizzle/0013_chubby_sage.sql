ALTER TABLE "comments" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "mentions" jsonb;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE set null ON UPDATE no action;