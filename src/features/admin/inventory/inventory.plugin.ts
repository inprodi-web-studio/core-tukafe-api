import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { adminInventoryService } from "./inventory.service";
import type { AdminInventoryService } from "./inventory.types";
import { adminInventoryCountsService } from "./counts/counts.service";
import type { AdminInventoryCountsService } from "./counts/counts.types";

declare module "@core/types/feature-namespaces" {
  interface AdminNamespace {
    inventory: AdminInventoryService;
    inventoryCounts: AdminInventoryCountsService;
  }
}

const adminInventoryServicesPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.admin.inventory = adminInventoryService(fastify);
  fastify.admin.inventoryCounts = adminInventoryCountsService(fastify);
};

export default fp(adminInventoryServicesPlugin, {
  name: "admin-inventory-services-plugin",
  dependencies: ["feature-namespaces"],
});
