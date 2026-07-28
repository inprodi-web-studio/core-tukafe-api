import { customerAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import {
  deleteInstallation,
  getPreferences,
  updatePreferences,
  upsertInstallation,
} from "./notifications.controllers";
import {
  deletePushInstallationParamsSchema,
  notificationPreferencesSchema,
  pushInstallationResponseSchema,
  updateNotificationPreferencesBodySchema,
  upsertPushInstallationBodySchema,
  type DeletePushInstallationParams,
  type UpdateNotificationPreferencesBody,
  type UpsertPushInstallationBody,
} from "./notifications.schemas";

export async function customerNotificationsRoutes(server: FastifyInstance) {
  server.get(
    "/preferences",
    {
      preHandler: [customerAuthHandler()],
      schema: { response: { 200: notificationPreferencesSchema } },
    },
    getPreferences,
  );

  server.patch<{ Body: UpdateNotificationPreferencesBody }>(
    "/preferences",
    {
      preHandler: [customerAuthHandler()],
      schema: {
        body: updateNotificationPreferencesBodySchema,
        response: { 200: notificationPreferencesSchema },
      },
    },
    updatePreferences,
  );

  server.put<{ Body: UpsertPushInstallationBody }>(
    "/installations",
    {
      preHandler: [customerAuthHandler()],
      schema: {
        body: upsertPushInstallationBodySchema,
        response: { 200: pushInstallationResponseSchema },
      },
    },
    upsertInstallation,
  );

  server.delete<{ Params: DeletePushInstallationParams }>(
    "/installations/:installationId",
    {
      preHandler: [customerAuthHandler()],
      schema: {
        params: deletePushInstallationParamsSchema,
        response: { 200: pushInstallationResponseSchema },
      },
    },
    deleteInstallation,
  );
}
