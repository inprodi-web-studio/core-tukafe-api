import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { adminProductsService } from "./products.service";

declare module "@core/types/feature-namespaces" {
  interface AdminNamespace {
    admin: {};
  }
}

const adminProductsServicesPlugin: FastifyPluginAsync = async (fastify) => {
  const productsService = adminProductsService(fastify);

  fastify.admin.products = {};
};

export default fp(adminProductsServicesPlugin, {
  name: "admin-products-services-plugin",
  dependencies: ["feature-namespaces", "products"],
});
