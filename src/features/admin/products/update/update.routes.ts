import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { updateProduct } from "./update.controllers";
import {
  bodySchema,
  paramsSchema,
  responseSchema,
  type Body,
  type Params,
} from "./update.schemas";

export async function updateRoutes(server: FastifyInstance) {
  server.patch<{ Params: Params; Body: Body }>(
    "/:productId",
    {
      preHandler: [
        adminAuthHandler({
          roles: ["owner", "admin"],
          permissions: { products: ["update"] },
        }),
      ],
      schema: {
        params: paramsSchema,
        body: bodySchema,
        response: { 200: responseSchema },
      },
    },
    updateProduct,
  );
}
