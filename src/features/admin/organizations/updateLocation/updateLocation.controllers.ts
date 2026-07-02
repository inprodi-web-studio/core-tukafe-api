import type { FastifyReply, FastifyRequest } from "fastify";
import type { Params, UpdateLocationBody } from "./updateLocation.schemas";

export async function updateLocation(
  request: FastifyRequest<{
    Params: Params;
    Body: UpdateLocationBody;
  }>,
  reply: FastifyReply,
) {
  const organization = await request.server.admin.organizations.updateLocation({
    organizationId: request.params.organizationId,
    activeOrganizationId: request.auth.member.organizationId,
    latitude: request.body.latitude,
    longitude: request.body.longitude,
  });

  return reply.status(200).send(organization);
}
