import type { FastifyReply, FastifyRequest } from "fastify";
import type { Body, Params } from "./updateCategories.schemas";

export async function updateCategories(
  request: FastifyRequest<{ Params: Params; Body: Body }>,
  reply: FastifyReply,
) {
  const result = await request.server.admin.products.updateCategories(
    request.params.productId,
    request.body,
  );

  return reply.status(200).send(result);
}
