import type { FastifyReply, FastifyRequest } from "fastify";
import type { Body, Params } from "./update.schemas";

export async function updateProduct(
  request: FastifyRequest<{ Params: Params; Body: Body }>,
  reply: FastifyReply,
) {
  const product = await request.server.admin.products.updateGeneral(
    request.params.productId,
    request.body,
  );
  return reply.status(200).send(product);
}
