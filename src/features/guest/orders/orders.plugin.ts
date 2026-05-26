import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { guestOrdersService } from "./orders.service";
import type { GuestOrdersService } from "./orders.types";

declare module "@core/types/feature-namespaces" {
  interface GuestNamespace {
    orders: GuestOrdersService;
  }
}

const guestOrdersServicesPlugin: FastifyPluginAsync = async (fastify) => {
  const ordersService = guestOrdersService(fastify);

  fastify.guest.orders = {
    create: ordersService.create,
    createPaymentAttempt: ordersService.createPaymentAttempt,
    preview: ordersService.preview,
    recordPaymentAttemptResult: ordersService.recordPaymentAttemptResult,
  };
};

export default fp(guestOrdersServicesPlugin, {
  name: "guest-orders-services-plugin",
  dependencies: ["feature-namespaces"],
});
