import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { reorder } from "./order.controllers";
import { orderBodySchema, paramsSchema, type OrderBody, type Params } from "./order.schemas";

export async function orderRoutes(server: FastifyInstance) {
  server.put<{ Params: Params; Body: OrderBody }>(
    "/:categoryId/order",
    {
      preHandler: [
        adminAuthHandler({
          roles: ["owner", "admin"],
          permissions: { productCategories: ["update"] },
        }),
      ],
      schema: { params: paramsSchema, body: orderBodySchema },
    },
    reorder,
  );
}
