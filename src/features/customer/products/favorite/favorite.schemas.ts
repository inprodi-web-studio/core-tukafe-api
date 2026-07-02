import { createPaginatedResponseSchema } from "@core/utils";
import { z } from "zod";
import { listResponseSchema } from "../list/list.schemas";

export const favoritesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export const paramsSchema = z.object({
  productId: z.nanoid(),
});

export const favoriteResponseSchema = z.object({
  productId: z.string(),
  isFavorite: z.boolean(),
});

export const favoritesResponseSchema = createPaginatedResponseSchema(listResponseSchema.element);

export type FavoritesQuery = z.infer<typeof favoritesQuerySchema>;
export type Params = z.infer<typeof paramsSchema>;
export type FavoriteResponse = z.infer<typeof favoriteResponseSchema>;
export type FavoritesResponse = z.infer<typeof favoritesResponseSchema>;
