import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { adminUnitsService } from "./units.service";
import type { AdminUnitsService } from "./units.types";

declare module "@core/types/feature-namespaces" {
  interface AdminNamespace {
    units: AdminUnitsService;
  }
}

const adminUnitsServicesPlugin: FastifyPluginAsync = async (fastify) => {
  const unitsService = adminUnitsService(fastify);

  fastify.admin.units = {
    get: unitsService.get,
    list: unitsService.list,
    create: unitsService.create,
  };
};

export default fp(adminUnitsServicesPlugin, {
  name: "admin-units-services-plugin",
  dependencies: ["feature-namespaces"],
});
