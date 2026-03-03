import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { adminIngredientsService } from "./ingredients.service";
import type { AdminIngredientsService } from "./ingredients.types";

declare module "@core/types/feature-namespaces" {
  interface AdminNamespace {
    ingredients: AdminIngredientsService;
  }
}

const adminIngredientsServicesPlugin: FastifyPluginAsync = async (fastify) => {
  const ingredientsService = adminIngredientsService(fastify);

  fastify.admin.ingredients = {
    get: ingredientsService.get,
    list: ingredientsService.list,
    create: ingredientsService.create,
  };
};

export default fp(adminIngredientsServicesPlugin, {
  name: "admin-ingredients-services-plugin",
  dependencies: ["feature-namespaces"],
});
