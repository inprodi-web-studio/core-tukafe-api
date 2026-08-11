import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { adminOrganizationsService } from "./organizations.service";
import type { AdminOrganizationsService } from "./organizations.types";

declare module "@core/types/feature-namespaces" {
  interface AdminNamespace {
    organizations: AdminOrganizationsService;
  }
}

const adminOrganizationsServicesPlugin: FastifyPluginAsync = async (fastify) => {
  const organizationsService = adminOrganizationsService(fastify);

  fastify.admin.organizations = {
    list: organizationsService.list,
    create: organizationsService.create,
    update: organizationsService.update,
    deactivate: organizationsService.deactivate,
    restore: organizationsService.restore,
    updateLocation: organizationsService.updateLocation,
  };
};

export default fp(adminOrganizationsServicesPlugin, {
  name: "admin-organizations-services-plugin",
  dependencies: ["feature-namespaces"],
});
