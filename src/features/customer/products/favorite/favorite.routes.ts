import { customerAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { listFavorites, markFavorite, unmarkFavorite } from "./favorite.controllers";
import {
  favoriteResponseSchema,
  favoritesQuerySchema,
  favoritesResponseSchema,
  paramsSchema,
  type FavoritesQuery,
  type Params,
} from "./favorite.schemas";

export async function favoriteRoutes(server: FastifyInstance) {
  server.get<{
    Querystring: FavoritesQuery;
  }>(
    "/favorites",
    {
      preHandler: [customerAuthHandler()],
      schema: {
        querystring: favoritesQuerySchema,
        response: {
          200: favoritesResponseSchema,
        },
      },
    },
    listFavorites,
  );

  server.put<{ Params: Params }>(
    "/:productId/favorite",
    {
      preHandler: [customerAuthHandler()],
      schema: {
        params: paramsSchema,
        response: {
          200: favoriteResponseSchema,
        },
      },
    },
    markFavorite,
  );

  server.delete<{ Params: Params }>(
    "/:productId/favorite",
    {
      preHandler: [customerAuthHandler()],
      schema: {
        params: paramsSchema,
        response: {
          200: favoriteResponseSchema,
        },
      },
    },
    unmarkFavorite,
  );
}
