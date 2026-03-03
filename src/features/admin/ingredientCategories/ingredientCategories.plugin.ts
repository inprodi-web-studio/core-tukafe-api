import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { adminIngredientCategoriesService } from "./ingredientCategories.service";
import type { AdminIngredientCategoriesService } from "./ingredientCategories.types";

declare module "@core/types/feature-namespaces" {
  interface AdminNamespace {
    ingredientCategories: AdminIngredientCategoriesService;
  }
}

const adminIngredientCategoriesServicesPlugin: FastifyPluginAsync = async (fastify) => {
  const ingredientCategoriesService = adminIngredientCategoriesService(fastify);

  fastify.admin.ingredientCategories = {
    get: ingredientCategoriesService.get,
    list: ingredientCategoriesService.list,
    create: ingredientCategoriesService.create,
  };
};

export default fp(adminIngredientCategoriesServicesPlugin, {
  name: "admin-ingredientCategories-services-plugin",
  dependencies: ["feature-namespaces"],
});
