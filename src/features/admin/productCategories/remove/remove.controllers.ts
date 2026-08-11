import type { FastifyReply, FastifyRequest } from "fastify";
import type { Params } from "./remove.schemas";

export async function remove(request: FastifyRequest<{ Params: Params }>, reply: FastifyReply) {
  await request.server.admin.productCategories.remove(request.params.categoryId);
  return reply.status(204).send();
}
