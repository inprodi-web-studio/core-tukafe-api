import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { adminProductsService } from "./products.service";
import type { AdminProductsService } from "./products.types";

declare module "@core/types/feature-namespaces" {
  interface AdminNamespace {
    products: AdminProductsService;
  }
}

const adminProductsServicesPlugin: FastifyPluginAsync = async (fastify) => {
  const productsService = adminProductsService(fastify);

  fastify.admin.products = {
    get: productsService.get,
    getGeneral: productsService.getGeneral,
    list: productsService.list,
    create: productsService.create,
    updateGeneral: productsService.updateGeneral,
    assignOrganization: productsService.assignOrganization,
    unassignOrganization: productsService.unassignOrganization,
    updateOrganizationStatus: productsService.updateOrganizationStatus,
    updateFeatured: productsService.updateFeatured,
    updateCategories: productsService.updateCategories,
    createVariation: productsService.createVariation,
    createModifier: productsService.createModifier,
    updateModifierOptions: productsService.updateModifierOptions,
  };
};

export default fp(adminProductsServicesPlugin, {
  name: "admin-products-services-plugin",
  dependencies: ["feature-namespaces"],
});
