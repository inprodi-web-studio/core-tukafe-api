import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { adminOrdersService } from "./orders.service";
import type { AdminOrdersService } from "./orders.types";

declare module "@core/types/feature-namespaces" {
  interface AdminNamespace {
    orders: AdminOrdersService;
  }
}

const adminOrdersServicesPlugin: FastifyPluginAsync = async (fastify) => {
  const orders = adminOrdersService(fastify);

  fastify.admin.orders = orders;
};

export default fp(adminOrdersServicesPlugin, {
  name: "admin-orders-services-plugin",
  dependencies: ["feature-namespaces"],
});
