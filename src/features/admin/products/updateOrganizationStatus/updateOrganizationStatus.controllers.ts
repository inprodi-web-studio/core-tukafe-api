import type { FastifyReply, FastifyRequest } from "fastify";
import type { Body, Params } from "./updateOrganizationStatus.schemas";

export async function updateOrganizationStatus(
  request: FastifyRequest<{ Params: Params; Body: Body }>,
  reply: FastifyReply,
) {
  const result = await request.server.admin.products.updateOrganizationStatus(
    request.params.productId,
    request.auth.member.organizationId,
    request.body.isActive,
  );

  return reply.status(200).send(result);
}
