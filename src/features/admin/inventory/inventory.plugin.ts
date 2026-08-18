import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { adminInventoryService } from "./inventory.service";
import type { AdminInventoryService } from "./inventory.types";

declare module "@core/types/feature-namespaces" {
  interface AdminNamespace {
    inventory: AdminInventoryService;
  }
}

const adminInventoryServicesPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.admin.inventory = adminInventoryService(fastify);
};

export default fp(adminInventoryServicesPlugin, {
  name: "admin-inventory-services-plugin",
  dependencies: ["feature-namespaces"],
});
