import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { adminProductcategoriesService } from "./productCategories.service";
import type { AdminProductcategoriesService } from "./productCategories.types";

declare module "@core/types/feature-namespaces" {
  interface AdminNamespace {
    productCategories: AdminProductcategoriesService;
  }
}

const adminProductcategoriesServicesPlugin: FastifyPluginAsync = async (fastify) => {
  const productCategoriesService = adminProductcategoriesService(fastify);

  fastify.admin.productCategories = {
    get: productCategoriesService.get,
    list: productCategoriesService.list,
    create: productCategoriesService.create,
  };
};

export default fp(adminProductcategoriesServicesPlugin, {
  name: "admin-productCategories-services-plugin",
  dependencies: ["feature-namespaces", "db"],
});
