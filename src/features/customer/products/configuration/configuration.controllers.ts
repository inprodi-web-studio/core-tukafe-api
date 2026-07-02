import type { FastifyReply, FastifyRequest } from "fastify";
import { withConfigurationFavoriteState } from "../products.helpers";
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

  const configurationWithFavorite = await withConfigurationFavoriteState(
    request.server,
    request.customerAuth.customer.id,
    configuration,
  );

  return reply.status(200).send(configurationWithFavorite);
}
