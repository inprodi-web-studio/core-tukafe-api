import type { FastifyReply, FastifyRequest } from "fastify";
import type { Params, UpdateBody } from "./update.schemas";

export async function update(
  request: FastifyRequest<{ Params: Params; Body: UpdateBody }>,
  reply: FastifyReply,
) {
  const updatedCategory = await request.server.admin.productCategories.update(
    request.params.categoryId,
    request.body,
  );

  return reply.status(200).send(updatedCategory);
}
