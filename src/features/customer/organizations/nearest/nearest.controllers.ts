import { findNearestOrganization } from "@features/shared/organizations";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { NearestQuery } from "./nearest.schemas";

export async function nearest(
  request: FastifyRequest<{
    Querystring: NearestQuery;
  }>,
  reply: FastifyReply,
) {
  const nearestOrganization = await findNearestOrganization(request.server, request.query);

  return reply.status(200).send(nearestOrganization);
}
