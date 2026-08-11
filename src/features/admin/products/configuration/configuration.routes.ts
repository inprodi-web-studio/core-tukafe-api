import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import {
  getConfiguration,
  replaceModifiers,
  replaceRecipe,
  replaceVariationConfiguration,
} from "./configuration.controllers";
import {
  configurationResponseSchema,
  paramsSchema,
  replaceModifiersBodySchema,
  replaceRecipeBodySchema,
  replaceVariationConfigurationBodySchema,
  type Params,
  type ReplaceModifiersBody,
  type ReplaceRecipeBody,
  type ReplaceVariationConfigurationBody,
} from "./configuration.schemas";

const productRead = adminAuthHandler({
  roles: ["owner", "admin"],
  permissions: { products: ["read"] },
});
const productUpdate = adminAuthHandler({
  roles: ["owner", "admin"],
  permissions: { products: ["update"] },
});

export async function productConfigurationRoutes(server: FastifyInstance) {
  server.get<{ Params: Params }>(
    "/:productId/configuration",
    {
      preHandler: [productRead],
      schema: {
        params: paramsSchema,
        response: { 200: configurationResponseSchema },
      },
    },
    getConfiguration,
  );

  server.put<{ Params: Params; Body: ReplaceVariationConfigurationBody }>(
    "/:productId/variation-configuration",
    {
      preHandler: [productUpdate],
      schema: {
        params: paramsSchema,
        body: replaceVariationConfigurationBodySchema,
        response: { 200: configurationResponseSchema },
      },
    },
    replaceVariationConfiguration,
  );

  server.put<{ Params: Params; Body: ReplaceModifiersBody }>(
    "/:productId/modifiers",
    {
      preHandler: [productUpdate],
      schema: {
        params: paramsSchema,
        body: replaceModifiersBodySchema,
        response: { 200: configurationResponseSchema },
      },
    },
    replaceModifiers,
  );

  server.put<{ Params: Params; Body: ReplaceRecipeBody }>(
    "/:productId/recipe",
    {
      preHandler: [productUpdate],
      schema: {
        params: paramsSchema,
        body: replaceRecipeBodySchema,
        response: { 200: configurationResponseSchema },
      },
    },
    replaceRecipe,
  );
}
