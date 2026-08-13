import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { adminSupplyCategoriesService } from "./supplyCategories.service";
import type { AdminSupplyCategoriesService } from "./supplyCategories.types";

declare module "@core/types/feature-namespaces" {
  interface AdminNamespace {
    supplyCategories: AdminSupplyCategoriesService;
  }
}

const adminSupplyCategoriesServicesPlugin: FastifyPluginAsync = async (fastify) => {
  const supplyCategoriesService = adminSupplyCategoriesService(fastify);

  fastify.admin.supplyCategories = {
    get: supplyCategoriesService.get,
    list: supplyCategoriesService.list,
    create: supplyCategoriesService.create,
    update: supplyCategoriesService.update,
    remove: supplyCategoriesService.remove,
  };
};

export default fp(adminSupplyCategoriesServicesPlugin, {
  name: "admin-supplyCategories-services-plugin",
  dependencies: ["feature-namespaces"],
});
