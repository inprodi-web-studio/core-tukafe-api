CREATE TABLE "admin_branch_access" (
	"user_id" text NOT NULL,
	"branch_id" bigint NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_branch_access_pk" PRIMARY KEY("user_id","branch_id")
);
--> statement-breakpoint
CREATE TABLE "branch_schedules" (
	"branch_id" bigint NOT NULL,
	"day_of_week" integer NOT NULL,
	"opens_at" time NOT NULL,
	"closes_at" time NOT NULL,
	CONSTRAINT "branch_schedules_pk" PRIMARY KEY("branch_id","day_of_week"),
	CONSTRAINT "branch_schedules_day_of_week_check" CHECK ("branch_schedules"."day_of_week" >= 0 AND "branch_schedules"."day_of_week" <= 6),
	CONSTRAINT "branch_schedules_time_check" CHECK ("branch_schedules"."opens_at" < "branch_schedules"."closes_at")
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "branches_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"address" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'customer';--> statement-breakpoint
ALTER TABLE "admin_branch_access" ADD CONSTRAINT "admin_branch_access_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_branch_access" ADD CONSTRAINT "admin_branch_access_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_schedules" ADD CONSTRAINT "branch_schedules_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_branch_access_branch_id_idx" ON "admin_branch_access" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "branch_schedules_day_of_week_idx" ON "branch_schedules" USING btree ("day_of_week");--> statement-breakpoint
CREATE UNIQUE INDEX "branches_name_unique" ON "branches" USING btree ("name");