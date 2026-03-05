import type { FastifyInstance } from "fastify";
import { createRoutes } from "./create";
import { createModifierRoutes } from "./createModifier";
import { createVariationRoutes } from "./createVariation";

export async function adminProductsRoutes(server: FastifyInstance) {
  await server.register(createRoutes);
  await server.register(createVariationRoutes);
  await server.register(createModifierRoutes);
}
