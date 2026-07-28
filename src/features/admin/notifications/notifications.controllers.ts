import { notificationCampaignsDB, userDB } from "@core/db/schemas";
import { conflict, forbidden, generateNanoId, notFound } from "@core/utils";
import { and, desc, eq, or, sql } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  CampaignParams,
  CreateCampaignBody,
  ScheduleCampaignBody,
  UpdateCampaignBody,
} from "./notifications.schemas";

async function canManageBrandCampaign(request: FastifyRequest) {
  const [user] = await request.server.db
    .select({ role: userDB.role })
    .from(userDB)
    .where(eq(userDB.id, request.auth.user.id))
    .limit(1);

  return user?.role === "owner";
}

async function organizationIdForScope(
  request: FastifyRequest,
  scope: "brand" | "organization",
) {
  if (scope === "brand") {
    if (!(await canManageBrandCampaign(request))) {
      throw forbidden(
        "notifications.brandScopeDenied",
        "Only a global owner can manage brand campaigns",
      );
    }
    return null;
  }

  return request.auth.member.organizationId;
}

async function getManageableCampaign(
  request: FastifyRequest<{ Params: CampaignParams }>,
) {
  const campaign = await request.server.db.query.notificationCampaignsDB.findFirst({
    where(table, { eq: eqOperator }) {
      return eqOperator(table.id, request.params.campaignId);
    },
  });

  if (!campaign) {
    throw notFound("notifications.campaignNotFound", "The notification campaign was not found");
  }

  if (
    campaign.scope === "brand"
      ? !(await canManageBrandCampaign(request))
      : campaign.organizationId !== request.auth.member.organizationId
  ) {
    throw forbidden(
      "notifications.campaignAccessDenied",
      "The notification campaign is outside the active organization",
    );
  }

  return campaign;
}

export async function listCampaigns(request: FastifyRequest, reply: FastifyReply) {
  const visibility = (await canManageBrandCampaign(request))
    ? or(
        eq(notificationCampaignsDB.scope, "brand"),
        eq(notificationCampaignsDB.organizationId, request.auth.member.organizationId),
      )
    : eq(notificationCampaignsDB.organizationId, request.auth.member.organizationId);
  const campaigns = await request.server.db
    .select()
    .from(notificationCampaignsDB)
    .where(visibility)
    .orderBy(desc(notificationCampaignsDB.createdAt))
    .limit(200);

  return reply.status(200).send(campaigns);
}

export async function createCampaign(
  request: FastifyRequest<{ Body: CreateCampaignBody }>,
  reply: FastifyReply,
) {
  const [campaign] = await request.server.db
    .insert(notificationCampaignsDB)
    .values({
      id: generateNanoId(),
      organizationId: await organizationIdForScope(request, request.body.scope),
      scope: request.body.scope,
      title: request.body.title,
      body: request.body.body,
      destination: request.body.destination,
      createdByUserId: request.auth.user.id,
    })
    .returning();

  return reply.status(201).send(campaign);
}

export async function updateCampaign(
  request: FastifyRequest<{ Params: CampaignParams; Body: UpdateCampaignBody }>,
  reply: FastifyReply,
) {
  const existing = await getManageableCampaign(request);
  if (existing.status !== "draft") {
    throw conflict(
      "notifications.campaignNotEditable",
      "Only draft notification campaigns can be edited",
    );
  }

  const [campaign] = await request.server.db
    .update(notificationCampaignsDB)
    .set({
      organizationId: await organizationIdForScope(request, request.body.scope),
      scope: request.body.scope,
      title: request.body.title,
      body: request.body.body,
      destination: request.body.destination,
      updatedAt: sql`now()`,
    })
    .where(eq(notificationCampaignsDB.id, existing.id))
    .returning();

  return reply.status(200).send(campaign);
}

async function schedule(
  request: FastifyRequest<{ Params: CampaignParams }>,
  scheduledAt: Date,
) {
  const existing = await getManageableCampaign(request);
  if (existing.status !== "draft") {
    throw conflict(
      "notifications.campaignNotSchedulable",
      "Only draft notification campaigns can be scheduled",
    );
  }

  const [campaign] = await request.server.db
    .update(notificationCampaignsDB)
    .set({
      status: "scheduled",
      scheduledAt,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(notificationCampaignsDB.id, existing.id),
        eq(notificationCampaignsDB.status, "draft"),
      ),
    )
    .returning();

  return campaign;
}

export async function sendCampaign(
  request: FastifyRequest<{ Params: CampaignParams }>,
  reply: FastifyReply,
) {
  const campaign = await schedule(request, new Date());
  return reply.status(200).send(campaign);
}

export async function scheduleCampaign(
  request: FastifyRequest<{ Params: CampaignParams; Body: ScheduleCampaignBody }>,
  reply: FastifyReply,
) {
  if (request.body.scheduledAt.getTime() <= Date.now()) {
    throw conflict(
      "notifications.scheduleMustBeFuture",
      "The campaign schedule must be in the future",
    );
  }

  const campaign = await schedule(request, request.body.scheduledAt);
  return reply.status(200).send(campaign);
}

export async function cancelCampaign(
  request: FastifyRequest<{ Params: CampaignParams }>,
  reply: FastifyReply,
) {
  const existing = await getManageableCampaign(request);
  if (existing.status !== "draft" && existing.status !== "scheduled") {
    throw conflict(
      "notifications.campaignNotCancellable",
      "Only draft or scheduled campaigns can be cancelled",
    );
  }

  const [campaign] = await request.server.db
    .update(notificationCampaignsDB)
    .set({
      status: "cancelled",
      completedAt: new Date(),
      updatedAt: sql`now()`,
    })
    .where(eq(notificationCampaignsDB.id, existing.id))
    .returning();

  return reply.status(200).send(campaign);
}
