import type { FastifyReply, FastifyRequest } from "fastify";
import type { Params, Query } from "./configuration.schemas";

export async function getConfiguration(
  request: FastifyRequest<{
    Params: Params;
    Querystring: Query;
  }>,
  reply: FastifyReply,
) {
  const configuration = await request.server.guest.products.getConfiguration(
    request.params.productId,
    request.query.organizationId,
  );

  return reply.status(200).send(configuration);
}
