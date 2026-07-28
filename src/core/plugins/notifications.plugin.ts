import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging, type BatchResponse, type Messaging } from "firebase-admin/messaging";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import type { PoolClient } from "pg";

import { env } from "@core/config/env.config";

interface ClaimedNotification {
  id: string;
  event_type: string;
  customer_id: string;
  campaign_id: string | null;
  order_id: string | null;
  title: string;
  body: string;
  destination: "home" | "orders";
  attempts: number;
  max_attempts: number;
}

interface PushInstallation {
  id: string;
  registration_target: string;
}

interface ClaimedCampaign {
  id: string;
  scope: "brand" | "organization";
  organization_id: string | null;
  title: string;
  body: string;
  destination: "home" | "orders";
}

const INVALID_TARGET_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

function createMessagingClient(): Messaging | null {
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    return null;
  }

  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY,
      }),
      projectId: env.FIREBASE_PROJECT_ID,
    });

  return getMessaging(app);
}

async function claimDueCampaign(client: PoolClient): Promise<ClaimedCampaign | null> {
  await client.query("begin");

  try {
    const result = await client.query<ClaimedCampaign>(`
      select id, scope, organization_id, title, body, destination
      from notification_campaign
      where status = 'scheduled' and scheduled_at <= now()
      order by scheduled_at asc, created_at asc
      for update skip locked
      limit 1
    `);
    const campaign = result.rows[0] ?? null;

    if (campaign) {
      await client.query(
        `update notification_campaign
         set status = 'processing', started_at = now(), updated_at = now()
         where id = $1`,
        [campaign.id],
      );
    }

    await client.query("commit");
    return campaign;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function expandCampaign(client: PoolClient, campaign: ClaimedCampaign) {
  const params: unknown[] = [
    campaign.id,
    campaign.title,
    campaign.body,
    campaign.destination,
  ];
  const organizationFilter =
    campaign.scope === "organization"
      ? `and exists (
          select 1 from "order" o
          where o.customer_id = c.id and o.organization_id = $5
        )`
      : "";

  if (campaign.scope === "organization") {
    params.push(campaign.organization_id);
  }

  await client.query(
    `insert into notification_outbox (
       id, dedupe_key, event_type, customer_id, campaign_id, title, body,
       destination, status, attempts, max_attempts, available_at, created_at, updated_at
     )
     select
       $1 || ':' || c.id,
       'campaign:' || $1 || ':' || c.id,
       'campaign',
       c.id,
       $1,
       $2,
       $3,
       $4,
       'pending',
       0,
       5,
       now(),
       now(),
       now()
     from customer c
     join customer_notification_preferences p on p.customer_id = c.id
     where c.deleted_at is null
       and p.promotions_enabled = true
       and exists (
         select 1
         from customer_push_installation i
         where i.customer_id = c.id
           and i.disabled_at is null
           and i.last_seen_at >= now() - interval '30 days'
       )
       ${organizationFilter}
     on conflict (dedupe_key) do nothing`,
    params,
  );

  await client.query(
    `update notification_campaign
     set recipient_count = (
           select count(*)::int from notification_outbox where campaign_id = $1
         ),
         status = case
           when not exists (select 1 from notification_outbox where campaign_id = $1)
             then 'sent'
           else status
         end,
         completed_at = case
           when not exists (select 1 from notification_outbox where campaign_id = $1)
             then now()
           else completed_at
         end,
         updated_at = now()
     where id = $1`,
    [campaign.id],
  );
}

async function claimNotifications(client: PoolClient): Promise<ClaimedNotification[]> {
  const result = await client.query<ClaimedNotification>(
    `with claimed as (
       select id
       from notification_outbox
       where status = 'pending' and available_at <= now()
       order by available_at asc, created_at asc
       for update skip locked
       limit $1
     )
     update notification_outbox n
     set status = 'processing',
         attempts = n.attempts + 1,
         claimed_at = now(),
         updated_at = now()
     from claimed
     where n.id = claimed.id
     returning n.id, n.event_type, n.customer_id, n.campaign_id, n.order_id,
       n.title, n.body, n.destination, n.attempts, n.max_attempts`,
    [env.NOTIFICATION_WORKER_BATCH_SIZE],
  );

  return result.rows;
}

async function getEligibleInstallations(
  client: PoolClient,
  notification: ClaimedNotification,
): Promise<PushInstallation[]> {
  const isCampaign = notification.event_type === "campaign";
  const preferenceColumn = isCampaign ? "promotions_enabled" : "order_ready_enabled";
  const freshnessFilter = isCampaign
    ? "and i.last_seen_at >= now() - interval '30 days'"
    : "";
  const result = await client.query<PushInstallation>(
    `select i.id, i.registration_target
     from customer_push_installation i
     left join customer_notification_preferences p on p.customer_id = i.customer_id
     where i.customer_id = $1
       and i.disabled_at is null
       and coalesce(p.${preferenceColumn}, ${isCampaign ? "false" : "true"}) = true
       ${freshnessFilter}
     order by i.last_seen_at desc`,
    [notification.customer_id],
  );

  return result.rows;
}

function collectDeliveryResults(response: BatchResponse, installations: PushInstallation[]) {
  let successCount = 0;
  const invalidInstallationIds: string[] = [];
  const errors: string[] = [];

  response.responses.forEach((item, index) => {
    if (item.success) {
      successCount += 1;
      return;
    }

    const code = item.error?.code ?? "messaging/unknown-error";
    errors.push(code);

    if (INVALID_TARGET_CODES.has(code) && installations[index]) {
      invalidInstallationIds.push(installations[index].id);
    }
  });

  return { successCount, invalidInstallationIds, errors };
}

async function refreshCampaignStatus(client: PoolClient, campaignId: string | null) {
  if (!campaignId) {
    return;
  }

  await client.query(
    `with totals as (
       select
         count(*) filter (where status = 'sent')::int as successes,
         count(*) filter (where status in ('failed', 'skipped'))::int as failures,
         count(*) filter (where status in ('pending', 'processing'))::int as outstanding,
         coalesce(sum(invalid_installation_count), 0)::int as invalid_installations
       from notification_outbox
       where campaign_id = $1
     )
     update notification_campaign c
     set success_count = totals.successes,
         failure_count = totals.failures,
         invalid_installation_count = totals.invalid_installations,
         status = case
           when totals.outstanding > 0 then 'processing'
           when totals.failures = 0 then 'sent'
           when totals.successes = 0 then 'failed'
           else 'partial'
         end,
         completed_at = case when totals.outstanding = 0 then now() else null end,
         updated_at = now()
     from totals
     where c.id = $1`,
    [campaignId],
  );
}

async function markSkipped(client: PoolClient, notification: ClaimedNotification, reason: string) {
  await client.query(
    `update notification_outbox
     set status = 'skipped', last_error = $2, claimed_at = null, updated_at = now()
     where id = $1`,
    [notification.id, reason],
  );
  await refreshCampaignStatus(client, notification.campaign_id);
}

async function markForRetryOrFailure(
  client: PoolClient,
  notification: ClaimedNotification,
  errorMessage: string,
) {
  const finalAttempt = notification.attempts >= notification.max_attempts;
  const delaySeconds = Math.min(30 * 2 ** Math.max(0, notification.attempts - 1), 3600);

  await client.query(
    `update notification_outbox
     set status = $2,
         available_at = case when $2 = 'pending' then now() + ($3 * interval '1 second') else available_at end,
         last_error = $4,
         claimed_at = null,
         updated_at = now()
     where id = $1`,
    [notification.id, finalAttempt ? "failed" : "pending", delaySeconds, errorMessage.slice(0, 2000)],
  );

  if (finalAttempt) {
    await refreshCampaignStatus(client, notification.campaign_id);
  }
}

async function deliverNotification(
  client: PoolClient,
  messaging: Messaging,
  notification: ClaimedNotification,
) {
  const installations = await getEligibleInstallations(client, notification);

  if (installations.length === 0) {
    await markSkipped(client, notification, "No eligible push installations");
    return;
  }

  try {
    let successCount = 0;
    const invalidInstallationIds: string[] = [];
    const errors: string[] = [];

    for (let index = 0; index < installations.length; index += 500) {
      const chunk = installations.slice(index, index + 500);
      const response = await messaging.sendEachForMulticast({
        tokens: chunk.map((installation) => installation.registration_target),
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: {
          version: "1",
          type: notification.event_type,
          destination: notification.destination,
          ...(notification.order_id ? { orderId: notification.order_id } : {}),
          ...(notification.campaign_id ? { campaignId: notification.campaign_id } : {}),
        },
        android: {
          priority: notification.event_type === "order.ready" ? "high" : "normal",
          notification: {
            channelId:
              notification.event_type === "order.ready"
                ? "tukafe_order_updates"
                : "tukafe_promotions",
          },
        },
        apns: {
          payload: {
            aps: { sound: "default" },
          },
        },
      });
      const results = collectDeliveryResults(response, chunk);
      successCount += results.successCount;
      invalidInstallationIds.push(...results.invalidInstallationIds);
      errors.push(...results.errors);
    }

    if (invalidInstallationIds.length > 0) {
      await client.query(
        `update customer_push_installation
         set disabled_at = now(), updated_at = now()
         where id = any($1::text[])`,
        [invalidInstallationIds],
      );
    }

    if (successCount === 0) {
      await markForRetryOrFailure(
        client,
        notification,
        errors.join(", ") || "FCM did not accept any delivery",
      );
      return;
    }

    await client.query(
      `update notification_outbox
       set status = 'sent',
           sent_at = now(),
           claimed_at = null,
           invalid_installation_count = $2,
           last_error = $3,
           updated_at = now()
       where id = $1`,
      [
        notification.id,
        invalidInstallationIds.length,
        errors.length > 0 ? errors.join(", ").slice(0, 2000) : null,
      ],
    );
    await refreshCampaignStatus(client, notification.campaign_id);
  } catch (error) {
    await markForRetryOrFailure(
      client,
      notification,
      error instanceof Error ? error.message : String(error),
    );
  }
}

const notificationsPlugin: FastifyPluginAsync = async (fastify) => {
  const messaging = createMessagingClient();

  if (!messaging) {
    fastify.log.warn("Firebase credentials are not configured; notification worker is disabled");
    return;
  }

  let running = false;
  let interval: NodeJS.Timeout | null = null;

  const tick = async () => {
    if (running) {
      return;
    }

    running = true;
    const client = await fastify.pg.connect();

    try {
      await client.query(
        `update notification_outbox
         set status = 'pending', claimed_at = null, updated_at = now()
         where status = 'processing' and claimed_at < now() - interval '10 minutes'`,
      );
      await client.query(
        `update notification_campaign
         set status = 'scheduled', started_at = null, updated_at = now()
         where status = 'processing'
           and started_at < now() - interval '10 minutes'
           and not exists (
             select 1 from notification_outbox n
             where n.campaign_id = notification_campaign.id
               and n.status in ('pending', 'processing', 'sent', 'failed', 'skipped')
           )`,
      );

      const campaign = await claimDueCampaign(client);
      if (campaign) {
        await expandCampaign(client, campaign);
      }

      const notifications = await claimNotifications(client);
      for (const notification of notifications) {
        await deliverNotification(client, messaging, notification);
      }
    } catch (error) {
      fastify.log.error({ err: error }, "Notification worker tick failed");
    } finally {
      client.release();
      running = false;
    }
  };

  if (env.NODE_ENV !== "test") {
    interval = setInterval(() => void tick(), env.NOTIFICATION_WORKER_INTERVAL_MS);
    interval.unref();
    setImmediate(() => void tick());
  }

  fastify.addHook("onClose", async () => {
    if (interval) {
      clearInterval(interval);
    }
  });

  fastify.log.info("Firebase notification worker initialized");
};

export default fp(notificationsPlugin, {
  name: "notifications",
  dependencies: ["db"],
});
