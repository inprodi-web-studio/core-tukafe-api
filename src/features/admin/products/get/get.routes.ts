import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { getProduct } from "./get.controllers";
import { paramsSchema, responseSchema, type Params } from "./get.schemas";

export async function getRoutes(server: FastifyInstance) {
  server.get<{ Params: Params }>(
    "/:productId",
    {
      preHandler: [
        adminAuthHandler({
          roles: ["owner", "admin"],
          permissions: { products: ["read"] },
        }),
      ],
      schema: {
        params: paramsSchema,
        response: { 200: responseSchema },
      },
    },
    getProduct,
  );
}
