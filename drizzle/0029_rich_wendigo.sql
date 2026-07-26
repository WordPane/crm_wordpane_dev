CREATE TABLE "webhook_failed_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event" text,
	"payload" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
