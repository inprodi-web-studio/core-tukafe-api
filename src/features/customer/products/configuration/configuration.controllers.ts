import type { FastifyReply, FastifyRequest } from "fastify";
import type { Params } from "./configuration.schemas";

export async function getConfiguration(
  request: FastifyRequest<{
    Params: Params;
  }>,
  reply: FastifyReply,
) {
  const configuration = await request.server.guest.products.getConfiguration(
    request.params.productId,
  );

  return reply.status(200).send(configuration);
}
