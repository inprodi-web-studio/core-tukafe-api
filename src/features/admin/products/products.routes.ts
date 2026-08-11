import type { FastifyInstance } from "fastify";
import { compoundOptionsRoutes } from "./compoundOptions";
import { assignOrganizationRoutes } from "./assignOrganization";
import { createRoutes } from "./create";
import { createModifierRoutes } from "./createModifier";
import { createVariationRoutes } from "./createVariation";
import { getRoutes } from "./get";
import { listRoutes } from "./list";
import { unassignOrganizationRoutes } from "./unassignOrganization";
import { updateRoutes } from "./update";
import { updateModifierOptionsRoutes } from "./updateModifierOptions";
import { updateOrganizationStatusRoutes } from "./updateOrganizationStatus";
import { updateFeaturedRoutes } from "./updateFeatured";
import { updateCategoriesRoutes } from "./updateCategories";
import { productConfigurationRoutes } from "./configuration";

export async function adminProductsRoutes(server: FastifyInstance) {
  await server.register(listRoutes);
  await server.register(compoundOptionsRoutes);
  await server.register(getRoutes);
  await server.register(productConfigurationRoutes);
  await server.register(createRoutes);
  await server.register(updateRoutes);
  await server.register(assignOrganizationRoutes);
  await server.register(unassignOrganizationRoutes);
  await server.register(createVariationRoutes);
  await server.register(createModifierRoutes);
  await server.register(updateModifierOptionsRoutes);
  await server.register(updateOrganizationStatusRoutes);
  await server.register(updateFeaturedRoutes);
  await server.register(updateCategoriesRoutes);
}
