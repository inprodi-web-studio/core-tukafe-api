import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { guestCustomersService } from "./customers.service";
import type { GuestCustomersService } from "./customers.types";

declare module "@core/types/feature-namespaces" {
  interface GuestNamespace {
    customers: GuestCustomersService;
  }
}

const guestCustomersServicesPlugin: FastifyPluginAsync = async (fastify) => {
  const customers = guestCustomersService(fastify);

  fastify.guest.customers = {
    findOrCreateByPhone: customers.findOrCreateByPhone,
  };
};

export default fp(guestCustomersServicesPlugin, {
  name: "guest-customers-services-plugin",
  dependencies: ["feature-namespaces"],
});
