import type { FastifyReply, FastifyRequest } from "fastify";
import type { Body, Params } from "./updateFeatured.schemas";

export async function updateFeatured(
  request: FastifyRequest<{ Params: Params; Body: Body }>,
  reply: FastifyReply,
) {
  const result = await request.server.admin.products.updateFeatured(
    request.params.productId,
    request.body.isFeatured,
  );

  return reply.status(200).send(result);
}
