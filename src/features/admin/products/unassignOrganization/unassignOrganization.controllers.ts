import type { FastifyReply, FastifyRequest } from "fastify";
import type { Params } from "./unassignOrganization.schemas";

export async function unassignOrganization(
  request: FastifyRequest<{
    Params: Params;
  }>,
  reply: FastifyReply,
) {
  const updatedProduct = await request.server.admin.products.unassignOrganization(
    request.params.productId,
    request.params.organizationId,
  );

  return reply.status(200).send(updatedProduct);
}
