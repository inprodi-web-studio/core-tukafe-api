import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { guestProductCategoriesService } from "./productCategories.service";
import type { GuestProductCategoriesService } from "./productCategories.types";

declare module "@core/types/feature-namespaces" {
  interface GuestNamespace {
    productCategories: GuestProductCategoriesService;
  }
}

const guestProductCategoriesServicesPlugin: FastifyPluginAsync = async (fastify) => {
  const productCategories = guestProductCategoriesService(fastify);

  fastify.guest.productCategories = {
    list: productCategories.list,
  };
};

export default fp(guestProductCategoriesServicesPlugin, {
  name: "guest-product-categories-services-plugin",
  dependencies: ["feature-namespaces"],
});
