import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { customerOrdersService } from "./orders.service";
import type { CustomerOrdersService } from "./orders.types";

declare module "@core/types/feature-namespaces" {
  interface CustomerNamespace {
    orders: CustomerOrdersService;
  }
}

const customerOrdersServicesPlugin: FastifyPluginAsync = async (fastify) => {
  const ordersService = customerOrdersService(fastify);

  fastify.customer.orders = {
    create: ordersService.create,
  };
};

export default fp(customerOrdersServicesPlugin, {
  name: "customer-orders-services-plugin",
  dependencies: ["feature-namespaces"],
});
