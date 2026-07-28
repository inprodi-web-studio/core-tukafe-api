import {
  customerNotificationPreferencesDB,
  customerPushInstallationsDB,
} from "@core/db/schemas";
import { generateNanoId } from "@core/utils";
import { and, eq, ne, sql } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  DeletePushInstallationParams,
  UpdateNotificationPreferencesBody,
  UpsertPushInstallationBody,
} from "./notifications.schemas";

export async function getPreferences(request: FastifyRequest, reply: FastifyReply) {
  const { customer } = request.customerAuth;
  const [preferences] = await request.server.db
    .insert(customerNotificationPreferencesDB)
    .values({ customerId: customer.id })
    .onConflictDoUpdate({
      target: customerNotificationPreferencesDB.customerId,
      set: { updatedAt: sql`${customerNotificationPreferencesDB.updatedAt}` },
    })
    .returning({
      orderReadyEnabled: customerNotificationPreferencesDB.orderReadyEnabled,
      promotionsEnabled: customerNotificationPreferencesDB.promotionsEnabled,
    });

  return reply.status(200).send(preferences);
}

export async function updatePreferences(
  request: FastifyRequest<{ Body: UpdateNotificationPreferencesBody }>,
  reply: FastifyReply,
) {
  const { customer } = request.customerAuth;
  const [preferences] = await request.server.db
    .insert(customerNotificationPreferencesDB)
    .values({
      customerId: customer.id,
      ...request.body,
    })
    .onConflictDoUpdate({
      target: customerNotificationPreferencesDB.customerId,
      set: {
        ...request.body,
        updatedAt: sql`now()`,
      },
    })
    .returning({
      orderReadyEnabled: customerNotificationPreferencesDB.orderReadyEnabled,
      promotionsEnabled: customerNotificationPreferencesDB.promotionsEnabled,
    });

  return reply.status(200).send(preferences);
}

export async function upsertInstallation(
  request: FastifyRequest<{ Body: UpsertPushInstallationBody }>,
  reply: FastifyReply,
) {
  const { customer } = request.customerAuth;
  const { installationId, registrationTarget, platform, appVersion } = request.body;

  await request.server.db.transaction(async (tx) => {
    await tx
      .delete(customerPushInstallationsDB)
      .where(
        and(
          eq(customerPushInstallationsDB.registrationTarget, registrationTarget),
          ne(customerPushInstallationsDB.installationId, installationId),
        ),
      );

    await tx
      .insert(customerPushInstallationsDB)
      .values({
        id: generateNanoId(),
        customerId: customer.id,
        installationId,
        registrationTarget,
        platform,
        appVersion,
        lastSeenAt: new Date(),
      })
      .onConflictDoUpdate({
        target: customerPushInstallationsDB.installationId,
        set: {
          customerId: customer.id,
          registrationTarget,
          platform,
          appVersion,
          lastSeenAt: sql`now()`,
          disabledAt: null,
          updatedAt: sql`now()`,
        },
      });
  });

  return reply.status(200).send({ success: true });
}

export async function deleteInstallation(
  request: FastifyRequest<{ Params: DeletePushInstallationParams }>,
  reply: FastifyReply,
) {
  const { customer } = request.customerAuth;

  await request.server.db
    .update(customerPushInstallationsDB)
    .set({
      disabledAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(customerPushInstallationsDB.customerId, customer.id),
        eq(customerPushInstallationsDB.installationId, request.params.installationId),
      ),
    );

  return reply.status(200).send({ success: true });
}
