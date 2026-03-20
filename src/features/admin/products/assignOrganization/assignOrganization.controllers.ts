import type { FastifyReply, FastifyRequest } from "fastify";
import type { Params } from "./assignOrganization.schemas";

export async function assignOrganization(
  request: FastifyRequest<{
    Params: Params;
  }>,
  reply: FastifyReply,
) {
  const updatedProduct = await request.server.admin.products.assignOrganization(
    request.params.productId,
    request.params.organizationId,
  );

  return reply.status(201).send(updatedProduct);
}
