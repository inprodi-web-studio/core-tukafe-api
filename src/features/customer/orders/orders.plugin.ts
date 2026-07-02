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
    preview: ordersService.preview,
    create: ordersService.create,
    get: ordersService.get,
    createStripePaymentSheet: ordersService.createStripePaymentSheet,
    confirmStripePaymentAttempt: ordersService.confirmStripePaymentAttempt,
    handleStripePaymentIntent: ordersService.handleStripePaymentIntent,
  };
};

export default fp(customerOrdersServicesPlugin, {
  name: "customer-orders-services-plugin",
  dependencies: ["feature-namespaces"],
});
