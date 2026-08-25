import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { adminPurchaseOrdersService } from "./purchaseOrders.service";
import type { AdminPurchaseOrdersService } from "./purchaseOrders.types";

declare module "@core/types/feature-namespaces" {
  interface AdminNamespace {
    purchaseOrders: AdminPurchaseOrdersService;
  }
}

const adminPurchaseOrdersServicesPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.admin.purchaseOrders = adminPurchaseOrdersService(fastify);
};

export default fp(adminPurchaseOrdersServicesPlugin, {
  name: "admin-purchase-orders-services-plugin",
  dependencies: ["feature-namespaces"],
});
