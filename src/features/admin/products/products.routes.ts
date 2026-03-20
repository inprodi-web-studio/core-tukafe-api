import type { FastifyInstance } from "fastify";
import { assignOrganizationRoutes } from "./assignOrganization";
import { createRoutes } from "./create";
import { createModifierRoutes } from "./createModifier";
import { createVariationRoutes } from "./createVariation";
import { listRoutes } from "./list";
import { unassignOrganizationRoutes } from "./unassignOrganization";

export async function adminProductsRoutes(server: FastifyInstance) {
  await server.register(listRoutes);
  await server.register(createRoutes);
  await server.register(assignOrganizationRoutes);
  await server.register(unassignOrganizationRoutes);
  await server.register(createVariationRoutes);
  await server.register(createModifierRoutes);
}
