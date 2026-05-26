import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { adminWorkOrdersService } from "./workOrders.service";
import type { AdminWorkOrdersService } from "./workOrders.types";

declare module "@core/types/feature-namespaces" {
  interface AdminNamespace {
    workOrders: AdminWorkOrdersService;
  }
}

const adminWorkOrdersServicesPlugin: FastifyPluginAsync = async (fastify) => {
  const workOrdersService = adminWorkOrdersService(fastify);

  fastify.admin.workOrders = {
    list: workOrdersService.list,
    complete: workOrdersService.complete,
  };
};

export default fp(adminWorkOrdersServicesPlugin, {
  name: "admin-work-orders-services-plugin",
  dependencies: ["feature-namespaces"],
});
