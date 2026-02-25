ALTER TABLE "customer_users" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "customer_users" CASCADE;--> statement-breakpoint
ALTER TABLE "customers" RENAME TO "customer_profile";--> statement-breakpoint
ALTER TABLE "customer_profile" DROP CONSTRAINT "customers_group_id_customer_groups_id_fk";
--> statement-breakpoint
DROP INDEX "customers_email_unique";--> statement-breakpoint
DROP INDEX "customers_group_id_idx";--> statement-breakpoint
ALTER TABLE "customer_profile" DROP CONSTRAINT "customers_pkey";--> statement-breakpoint
ALTER TABLE "customer_profile" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "customer_profile" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "customer_profile" DROP COLUMN "email";--> statement-breakpoint
ALTER TABLE "customer_profile" DROP COLUMN "phone";--> statement-breakpoint
ALTER TABLE "customer_profile" ADD COLUMN "user_id" text PRIMARY KEY NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "phone_number" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "phone_number_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN IF EXISTS "first_name";--> statement-breakpoint
ALTER TABLE "customer_profile" ADD CONSTRAINT "customer_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_profile" ADD CONSTRAINT "customer_profile_group_id_customer_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."customer_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_profile_group_id_idx" ON "customer_profile" USING btree ("group_id");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_phone_number_unique" UNIQUE("phone_number");