import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { updateCategories } from "./updateCategories.controllers";
import {
  bodySchema,
  paramsSchema,
  responseSchema,
  type Body,
  type Params,
} from "./updateCategories.schemas";

export async function updateCategoriesRoutes(server: FastifyInstance) {
  server.put<{ Params: Params; Body: Body }>(
    "/:productId/categories",
    {
      preHandler: [
        adminAuthHandler({
          permissions: { products: ["update"] },
          roles: ["owner", "admin"],
        }),
      ],
      schema: {
        params: paramsSchema,
        body: bodySchema,
        response: { 200: responseSchema },
      },
    },
    updateCategories,
  );
}
