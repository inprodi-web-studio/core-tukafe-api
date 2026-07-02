import { customerProductFavoritesDB, productsDB } from "@core/db/schemas";
import { notFound } from "@core/utils";
import type {
  GuestProductConfiguration,
  GuestProductListItem,
} from "@features/guest/products/products.types";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

export type CustomerProductListItem = GuestProductListItem & {
  isFavorite: boolean;
};

export type CustomerProductConfiguration = GuestProductConfiguration & {
  isFavorite: boolean;
};

export async function assertCustomerProductExists(
  fastify: FastifyInstance,
  productId: string,
): Promise<void> {
  const product = await fastify.db.query.productsDB.findFirst({
    where(table, { and: andOperator, eq, isNull: isNullOperator }) {
      return andOperator(eq(table.id, productId), isNullOperator(table.deletedAt));
    },
    columns: {
      id: true,
    },
  });

  if (!product) {
    throw notFound("product.notFound", "The product was not found");
  }
}

export async function getFavoriteProductIds(
  fastify: FastifyInstance,
  customerId: string,
  productIds: string[],
): Promise<Set<string>> {
  if (productIds.length === 0) {
    return new Set();
  }

  const favorites = await fastify.db
    .select({
      productId: customerProductFavoritesDB.productId,
    })
    .from(customerProductFavoritesDB)
    .innerJoin(productsDB, eq(customerProductFavoritesDB.productId, productsDB.id))
    .where(
      and(
        eq(customerProductFavoritesDB.customerId, customerId),
        inArray(customerProductFavoritesDB.productId, productIds),
        isNull(productsDB.deletedAt),
      ),
    );

  return new Set(favorites.map((favorite) => favorite.productId));
}

export async function isFavoriteProduct(
  fastify: FastifyInstance,
  customerId: string,
  productId: string,
): Promise<boolean> {
  const favoriteIds = await getFavoriteProductIds(fastify, customerId, [productId]);
  return favoriteIds.has(productId);
}

export async function withFavoriteState(
  fastify: FastifyInstance,
  customerId: string,
  products: GuestProductListItem[],
): Promise<CustomerProductListItem[]> {
  const favoriteProductIds = await getFavoriteProductIds(
    fastify,
    customerId,
    products.map((product) => product.id),
  );

  return products.map((product) => ({
    ...product,
    isFavorite: favoriteProductIds.has(product.id),
  }));
}

export async function withConfigurationFavoriteState(
  fastify: FastifyInstance,
  customerId: string,
  configuration: GuestProductConfiguration,
): Promise<CustomerProductConfiguration> {
  return {
    ...configuration,
    isFavorite: await isFavoriteProduct(fastify, customerId, configuration.product.id),
  };
}
