import { customerProductFavoritesDB, productsDB } from "@core/db/schemas";
import { paginate } from "@core/utils";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { assertCustomerProductExists } from "../products.helpers";
import type { FavoritesQuery, Params } from "./favorite.schemas";

export async function listFavorites(
  request: FastifyRequest<{
    Querystring: FavoritesQuery;
  }>,
  reply: FastifyReply,
) {
  const customerId = request.customerAuth.customer.id;
  const { page, pageSize } = request.query;

  const paginatedFavoriteProductIds = await paginate({
    executor: request.server.db,
    createQuery: () =>
      request.server.db
        .select({
          productId: customerProductFavoritesDB.productId,
        })
        .from(customerProductFavoritesDB)
        .innerJoin(productsDB, eq(customerProductFavoritesDB.productId, productsDB.id))
        .where(
          and(eq(customerProductFavoritesDB.customerId, customerId), isNull(productsDB.deletedAt)),
        )
        .$dynamic(),
    orderBy: [asc(productsDB.name), asc(productsDB.id)],
    page,
    pageSize,
    mapRow: (favorite) => favorite.productId,
  });

  const products = await request.server.guest.products.list();
  const productsById = new Map(products.map((product) => [product.id, product]));
  const favoriteProducts = paginatedFavoriteProductIds.data
    .map((productId) => productsById.get(productId))
    .filter((product): product is NonNullable<typeof product> => Boolean(product))
    .map((product) => ({
      ...product,
      isFavorite: true,
    }));

  return reply.status(200).send({
    data: favoriteProducts,
    pagination: paginatedFavoriteProductIds.pagination,
  });
}

export async function markFavorite(
  request: FastifyRequest<{
    Params: Params;
  }>,
  reply: FastifyReply,
) {
  const { productId } = request.params;
  const customerId = request.customerAuth.customer.id;

  await assertCustomerProductExists(request.server, productId);

  await request.server.db
    .insert(customerProductFavoritesDB)
    .values({
      customerId,
      productId,
    })
    .onConflictDoNothing();

  return reply.status(200).send({
    productId,
    isFavorite: true,
  });
}

export async function unmarkFavorite(
  request: FastifyRequest<{
    Params: Params;
  }>,
  reply: FastifyReply,
) {
  const { productId } = request.params;
  const customerId = request.customerAuth.customer.id;

  await assertCustomerProductExists(request.server, productId);

  await request.server.db
    .delete(customerProductFavoritesDB)
    .where(
      and(
        eq(customerProductFavoritesDB.customerId, customerId),
        eq(customerProductFavoritesDB.productId, productId),
      ),
    );

  return reply.status(200).send({
    productId,
    isFavorite: false,
  });
}
