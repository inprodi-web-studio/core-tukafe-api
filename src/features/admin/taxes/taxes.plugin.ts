import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { adminTaxesService } from "./taxes.service";
import type { AdminTaxesService } from "./taxes.types";

declare module "@core/types/feature-namespaces" {
  interface AdminNamespace {
    taxes: AdminTaxesService;
  }
}

const adminTaxesServicesPlugin: FastifyPluginAsync = async (fastify) => {
  const taxesService = adminTaxesService(fastify);

  fastify.admin.taxes = {
    list: taxesService.list,
    create: taxesService.create,
  };
};

export default fp(adminTaxesServicesPlugin, {
  name: "admin-taxes-services-plugin",
  dependencies: ["feature-namespaces", "db"],
});
