import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { adminVariationGroupsService } from "./variationGroups.service";
import type { AdminVariationGroupsService } from "./variationGroups.types";

declare module "@core/types/feature-namespaces" {
  interface AdminNamespace {
    variationGroups: AdminVariationGroupsService;
  }
}

const adminVariationGroupsServicesPlugin: FastifyPluginAsync = async (fastify) => {
  const variationGroupsService = adminVariationGroupsService(fastify);

  fastify.admin.variationGroups = {
    get: variationGroupsService.get,
    list: variationGroupsService.list,
    create: variationGroupsService.create,
  };
};

export default fp(adminVariationGroupsServicesPlugin, {
  name: "admin-variation-groups-services-plugin",
  dependencies: ["feature-namespaces"],
});
