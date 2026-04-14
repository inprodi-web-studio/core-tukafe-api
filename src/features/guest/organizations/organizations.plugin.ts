import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { guestOrganizationsService } from "./organizations.service";
import type { GuestOrganizationsService } from "./organizations.types";

declare module "@core/types/feature-namespaces" {
  interface GuestNamespace {
    organizations: GuestOrganizationsService;
  }
}

const guestOrganizationsServicesPlugin: FastifyPluginAsync = async (fastify) => {
  const organizations = guestOrganizationsService(fastify);

  fastify.guest.organizations = {
    list: organizations.list,
  };
};

export default fp(guestOrganizationsServicesPlugin, {
  name: "guest-organizations-services-plugin",
  dependencies: ["feature-namespaces"],
});
