import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { adminSuppliersService } from "./suppliers.service";
import type { AdminSuppliersService } from "./suppliers.types";

declare module "@core/types/feature-namespaces" {
  interface AdminNamespace {
    suppliers: AdminSuppliersService;
  }
}

const adminSuppliersServicesPlugin: FastifyPluginAsync = async (fastify) => {
  const suppliersService = adminSuppliersService(fastify);

  fastify.admin.suppliers = {
    get: suppliersService.get,
    list: suppliersService.list,
    create: suppliersService.create,
  };
};

export default fp(adminSuppliersServicesPlugin, {
  name: "admin-suppliers-services-plugin",
  dependencies: ["feature-namespaces"],
});
