import type { FastifyReply, FastifyRequest } from "fastify";
import type { CreateVariationBody, Params } from "./createVariation.schemas";

export async function createVariation(
  request: FastifyRequest<{
    Params: Params;
    Body: CreateVariationBody;
  }>,
  reply: FastifyReply,
) {
  const updatedProduct = await request.server.admin.products.createVariation(
    request.params.productId,
    request.body,
  );

  return reply.status(201).send(updatedProduct);
}
