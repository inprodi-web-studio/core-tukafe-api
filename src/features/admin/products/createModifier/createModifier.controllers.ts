import type { FastifyReply, FastifyRequest } from "fastify";
import type { CreateModifierBody, Params } from "./createModifier.schemas";

export async function createModifier(
  request: FastifyRequest<{
    Params: Params;
    Body: CreateModifierBody;
  }>,
  reply: FastifyReply,
) {
  const updatedProduct = await request.server.admin.products.createModifier(
    request.params.productId,
    request.body,
  );

  return reply.status(201).send(updatedProduct);
}
