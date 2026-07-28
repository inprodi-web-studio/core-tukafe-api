import {
  NOTIFICATION_CAMPAIGN_SCOPES,
  NOTIFICATION_CAMPAIGN_STATUSES,
  NOTIFICATION_DESTINATIONS,
} from "@core/db/schemas";
import { z } from "zod";

export const campaignResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string().nullable(),
    scope: z.enum(NOTIFICATION_CAMPAIGN_SCOPES),
    title: z.string(),
    body: z.string(),
    destination: z.enum(NOTIFICATION_DESTINATIONS),
    status: z.enum(NOTIFICATION_CAMPAIGN_STATUSES),
    scheduledAt: z.date().nullable(),
    startedAt: z.date().nullable(),
    completedAt: z.date().nullable(),
    createdByUserId: z.string(),
    recipientCount: z.number().int(),
    successCount: z.number().int(),
    failureCount: z.number().int(),
    invalidInstallationCount: z.number().int(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();

export const listCampaignsResponseSchema = z.array(campaignResponseSchema);

export const createCampaignBodySchema = z
  .object({
    scope: z.enum(NOTIFICATION_CAMPAIGN_SCOPES),
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(500),
    destination: z.enum(NOTIFICATION_DESTINATIONS),
  })
  .strict();
export type CreateCampaignBody = z.infer<typeof createCampaignBodySchema>;

export const updateCampaignBodySchema = createCampaignBodySchema;
export type UpdateCampaignBody = z.infer<typeof updateCampaignBodySchema>;

export const campaignParamsSchema = z.object({ campaignId: z.string().min(1) }).strict();
export type CampaignParams = z.infer<typeof campaignParamsSchema>;

export const scheduleCampaignBodySchema = z
  .object({
    scheduledAt: z.coerce.date(),
  })
  .strict();
export type ScheduleCampaignBody = z.infer<typeof scheduleCampaignBodySchema>;
