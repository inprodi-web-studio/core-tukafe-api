import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import {
  cancelCampaign,
  createCampaign,
  listCampaigns,
  scheduleCampaign,
  sendCampaign,
  updateCampaign,
} from "./notifications.controllers";
import {
  campaignParamsSchema,
  campaignResponseSchema,
  createCampaignBodySchema,
  listCampaignsResponseSchema,
  scheduleCampaignBodySchema,
  updateCampaignBodySchema,
  type CampaignParams,
  type CreateCampaignBody,
  type ScheduleCampaignBody,
  type UpdateCampaignBody,
} from "./notifications.schemas";

const portalRoles = ["owner", "admin"] as const;

export async function adminNotificationsRoutes(server: FastifyInstance) {
  server.get(
    "/campaigns",
    {
      preHandler: [
        adminAuthHandler({ roles: portalRoles, permissions: { notifications: ["read"] } }),
      ],
      schema: { response: { 200: listCampaignsResponseSchema } },
    },
    listCampaigns,
  );

  server.post<{ Body: CreateCampaignBody }>(
    "/campaigns",
    {
      preHandler: [
        adminAuthHandler({ roles: portalRoles, permissions: { notifications: ["create"] } }),
      ],
      schema: {
        body: createCampaignBodySchema,
        response: { 201: campaignResponseSchema },
      },
    },
    createCampaign,
  );

  server.patch<{ Params: CampaignParams; Body: UpdateCampaignBody }>(
    "/campaigns/:campaignId",
    {
      preHandler: [
        adminAuthHandler({ roles: portalRoles, permissions: { notifications: ["update"] } }),
      ],
      schema: {
        params: campaignParamsSchema,
        body: updateCampaignBodySchema,
        response: { 200: campaignResponseSchema },
      },
    },
    updateCampaign,
  );

  server.post<{ Params: CampaignParams }>(
    "/campaigns/:campaignId/send",
    {
      preHandler: [
        adminAuthHandler({ roles: portalRoles, permissions: { notifications: ["create"] } }),
      ],
      schema: {
        params: campaignParamsSchema,
        response: { 200: campaignResponseSchema },
      },
    },
    sendCampaign,
  );

  server.post<{ Params: CampaignParams; Body: ScheduleCampaignBody }>(
    "/campaigns/:campaignId/schedule",
    {
      preHandler: [
        adminAuthHandler({ roles: portalRoles, permissions: { notifications: ["create"] } }),
      ],
      schema: {
        params: campaignParamsSchema,
        body: scheduleCampaignBodySchema,
        response: { 200: campaignResponseSchema },
      },
    },
    scheduleCampaign,
  );

  server.post<{ Params: CampaignParams }>(
    "/campaigns/:campaignId/cancel",
    {
      preHandler: [
        adminAuthHandler({ roles: portalRoles, permissions: { notifications: ["update"] } }),
      ],
      schema: {
        params: campaignParamsSchema,
        response: { 200: campaignResponseSchema },
      },
    },
    cancelCampaign,
  );
}
