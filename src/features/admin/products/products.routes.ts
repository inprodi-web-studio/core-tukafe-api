import type { FastifyInstance } from "fastify";
import { createRoutes } from "./create";
import { createModifierRoutes } from "./createModifier";
import { createVariationRoutes } from "./createVariation";
import { listRoutes } from "./list";

export async function adminProductsRoutes(server: FastifyInstance) {
  await server.register(listRoutes);
  await server.register(createRoutes);
  await server.register(createVariationRoutes);
  await server.register(createModifierRoutes);
}
