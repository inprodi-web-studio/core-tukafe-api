import type { FastifyReply, FastifyRequest } from "fastify";
import { withFavoriteState } from "../products.helpers";
import type { RecommendedQuery } from "./recommended.schemas";

export async function listRecommended(
  request: FastifyRequest<{
    Querystring: RecommendedQuery;
  }>,
  reply: FastifyReply,
) {
  const products = await request.server.guest.products.listRecommended({
    customerId: request.customerAuth.customer.id,
    organizationId: request.query.organizationId,
    limit: 10,
    windowDays: 90,
  });

  const productsWithFavorites = await withFavoriteState(
    request.server,
    request.customerAuth.customer.id,
    products,
  );

  return reply.status(200).send(productsWithFavorites);
}
