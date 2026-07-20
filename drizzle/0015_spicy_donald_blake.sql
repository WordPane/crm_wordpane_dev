ALTER TABLE "client_registrations" ADD COLUMN "logradouro" varchar(255);--> statement-breakpoint
ALTER TABLE "client_registrations" ADD COLUMN "numero" varchar(20);--> statement-breakpoint
ALTER TABLE "client_registrations" ADD COLUMN "complemento" varchar(120);--> statement-breakpoint
ALTER TABLE "client_registrations" ADD COLUMN "bairro" varchar(120);--> statement-breakpoint
ALTER TABLE "client_registrations" ADD COLUMN "cep" varchar(9);