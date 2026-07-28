CREATE TABLE "customer_notification_preferences" (
  "customer_id" text PRIMARY KEY NOT NULL REFERENCES "customer"("id") ON DELETE CASCADE,
  "order_ready_enabled" boolean DEFAULT true NOT NULL,
  "promotions_enabled" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "customer_push_installation" (
  "id" text PRIMARY KEY NOT NULL,
  "customer_id" text NOT NULL REFERENCES "customer"("id") ON DELETE CASCADE,
  "installation_id" text NOT NULL,
  "registration_target" text NOT NULL,
  "platform" text NOT NULL,
  "app_version" text,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "disabled_at" timestamp with time zone,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "customer_push_installation_platform_check" CHECK ("platform" in ('ios', 'android')),
  CONSTRAINT "customer_push_installation_target_non_empty_check" CHECK (btrim("registration_target") <> '')
);

CREATE TABLE "notification_campaign" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text REFERENCES "organization"("id") ON DELETE RESTRICT,
  "scope" text NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "destination" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "scheduled_at" timestamp with time zone,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_by_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
  "recipient_count" integer DEFAULT 0 NOT NULL,
  "success_count" integer DEFAULT 0 NOT NULL,
  "failure_count" integer DEFAULT 0 NOT NULL,
  "invalid_installation_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "notification_campaign_scope_check" CHECK ("scope" in ('brand', 'organization')),
  CONSTRAINT "notification_campaign_scope_organization_check" CHECK (("scope" = 'brand' and "organization_id" is null) or ("scope" = 'organization' and "organization_id" is not null)),
  CONSTRAINT "notification_campaign_status_check" CHECK ("status" in ('draft', 'scheduled', 'processing', 'sent', 'partial', 'failed', 'cancelled')),
  CONSTRAINT "notification_campaign_destination_check" CHECK ("destination" in ('home', 'orders')),
  CONSTRAINT "notification_campaign_title_non_empty_check" CHECK (btrim("title") <> ''),
  CONSTRAINT "notification_campaign_body_non_empty_check" CHECK (btrim("body") <> '')
);

CREATE TABLE "notification_outbox" (
  "id" text PRIMARY KEY NOT NULL,
  "dedupe_key" text NOT NULL,
  "event_type" text NOT NULL,
  "customer_id" text NOT NULL REFERENCES "customer"("id") ON DELETE CASCADE,
  "campaign_id" text REFERENCES "notification_campaign"("id") ON DELETE CASCADE,
  "order_id" text REFERENCES "order"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "destination" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 5 NOT NULL,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "claimed_at" timestamp with time zone,
  "sent_at" timestamp with time zone,
  "last_error" text,
  "invalid_installation_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "notification_outbox_status_check" CHECK ("status" in ('pending', 'processing', 'sent', 'skipped', 'failed')),
  CONSTRAINT "notification_outbox_destination_check" CHECK ("destination" in ('home', 'orders')),
  CONSTRAINT "notification_outbox_attempts_check" CHECK ("attempts" >= 0 and "max_attempts" > 0)
);

CREATE UNIQUE INDEX "customer_push_installation_installation_id_unique" ON "customer_push_installation" ("installation_id");
CREATE UNIQUE INDEX "customer_push_installation_registration_target_unique" ON "customer_push_installation" ("registration_target");
CREATE INDEX "customer_push_installation_customer_id_idx" ON "customer_push_installation" ("customer_id");
CREATE INDEX "customer_push_installation_active_last_seen_idx" ON "customer_push_installation" ("disabled_at", "last_seen_at");
CREATE INDEX "customer_notification_preferences_updated_at_idx" ON "customer_notification_preferences" ("updated_at");
CREATE INDEX "notification_campaign_status_scheduled_at_idx" ON "notification_campaign" ("status", "scheduled_at");
CREATE INDEX "notification_campaign_organization_created_at_idx" ON "notification_campaign" ("organization_id", "created_at");
CREATE UNIQUE INDEX "notification_outbox_dedupe_key_unique" ON "notification_outbox" ("dedupe_key");
CREATE INDEX "notification_outbox_claim_idx" ON "notification_outbox" ("status", "available_at");
CREATE INDEX "notification_outbox_campaign_id_idx" ON "notification_outbox" ("campaign_id");
CREATE INDEX "notification_outbox_customer_id_idx" ON "notification_outbox" ("customer_id");
