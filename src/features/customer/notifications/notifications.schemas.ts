import { z } from "zod";

export const notificationPreferencesSchema = z
  .object({
    orderReadyEnabled: z.boolean(),
    promotionsEnabled: z.boolean(),
  })
  .strict();

export const updateNotificationPreferencesBodySchema = notificationPreferencesSchema;
export type UpdateNotificationPreferencesBody = z.infer<
  typeof updateNotificationPreferencesBodySchema
>;

export const upsertPushInstallationBodySchema = z
  .object({
    installationId: z.string().trim().min(1).max(200),
    registrationTarget: z.string().trim().min(1).max(4096),
    platform: z.enum(["ios", "android"]),
    appVersion: z.string().trim().min(1).max(100).optional(),
  })
  .strict();
export type UpsertPushInstallationBody = z.infer<typeof upsertPushInstallationBodySchema>;

export const deletePushInstallationParamsSchema = z
  .object({
    installationId: z.string().trim().min(1).max(200),
  })
  .strict();
export type DeletePushInstallationParams = z.infer<typeof deletePushInstallationParamsSchema>;

export const pushInstallationResponseSchema = z
  .object({
    success: z.literal(true),
  })
  .strict();
