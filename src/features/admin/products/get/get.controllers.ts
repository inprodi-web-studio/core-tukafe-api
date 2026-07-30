import type { FastifyReply, FastifyRequest } from "fastify";
import type { Params } from "./get.schemas";

export async function getProduct(request: FastifyRequest<{ Params: Params }>, reply: FastifyReply) {
  const product = await request.server.admin.products.getGeneral(
    request.params.productId,
    request.auth.member.organizationId,
  );
  return reply.status(200).send(product);
}
