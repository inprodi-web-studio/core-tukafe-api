import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { adminSuppliesService } from "./supplies.service";
import type { AdminSuppliesService } from "./supplies.types";

declare module "@core/types/feature-namespaces" {
  interface AdminNamespace {
    supplies: AdminSuppliesService;
  }
}

const adminSuppliesServicesPlugin: FastifyPluginAsync = async (fastify) => {
  const suppliesService = adminSuppliesService(fastify);

  fastify.admin.supplies = {
    get: suppliesService.get,
    list: suppliesService.list,
    create: suppliesService.create,
  };
};

export default fp(adminSuppliesServicesPlugin, {
  name: "admin-supplies-services-plugin",
  dependencies: ["feature-namespaces"],
});
