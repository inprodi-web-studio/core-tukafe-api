import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { guestProductsService } from "./products.service";
import type { GuestProductsService } from "./products.types";

declare module "@core/types/feature-namespaces" {
  interface GuestNamespace {
    products: GuestProductsService;
  }
}

const guestProductsServicesPlugin: FastifyPluginAsync = async (fastify) => {
  const products = guestProductsService(fastify);

  fastify.guest.products = {
    getConfiguration: products.getConfiguration,
    getCustomerProductOrderCount: products.getCustomerProductOrderCount,
    list: products.list,
  };
};

export default fp(guestProductsServicesPlugin, {
  name: "guest-products-services-plugin",
  dependencies: ["feature-namespaces"],
});
