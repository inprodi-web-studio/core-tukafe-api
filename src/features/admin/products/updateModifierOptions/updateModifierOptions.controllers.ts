import type { FastifyReply, FastifyRequest } from "fastify";
import type { Params, UpdateModifierOptionsBody } from "./updateModifierOptions.schemas";

export async function updateModifierOptions(
  request: FastifyRequest<{
    Params: Params;
    Body: UpdateModifierOptionsBody;
  }>,
  reply: FastifyReply,
) {
  const updatedProduct = await request.server.admin.products.updateModifierOptions(
    request.params.productId,
    request.params.modifierId,
    request.body,
  );

  return reply.status(200).send(updatedProduct);
}
