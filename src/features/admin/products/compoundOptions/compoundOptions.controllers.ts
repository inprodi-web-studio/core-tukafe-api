import type { FastifyReply, FastifyRequest } from "fastify";
import type { Params, Query } from "./compoundOptions.schemas";

export async function listCompoundOptions(
  request: FastifyRequest<{ Params: Params; Querystring: Query }>,
  reply: FastifyReply,
) {
  const options = await request.server.admin.products.listCompoundOptions(
    request.params.productId,
    {
      ...request.query,
      organizationId: request.auth.member.organizationId,
    },
  );

  return reply.status(200).send(options);
}
