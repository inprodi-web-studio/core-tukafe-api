import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { adminCustomersService } from "./customers.service";
import type { AdminCustomersService } from "./customers.types";

declare module "@core/types/feature-namespaces" {
  interface AdminNamespace {
    customers: AdminCustomersService;
  }
}

const adminCustomersServicesPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.admin.customers = adminCustomersService(fastify);
};

export default fp(adminCustomersServicesPlugin, {
  name: "admin-customers-services-plugin",
  dependencies: ["feature-namespaces"],
});
