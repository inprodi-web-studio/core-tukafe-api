import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { adminModifiersService } from "./modifiers.service";
import type { AdminModifiersService } from "./modifiers.types";

declare module "@core/types/feature-namespaces" {
  interface AdminNamespace {
    modifiers: AdminModifiersService;
  }
}

const adminModifiersServicesPlugin: FastifyPluginAsync = async (fastify) => {
  const modifiersService = adminModifiersService(fastify);

  fastify.admin.modifiers = {
    get: modifiersService.get,
    list: modifiersService.list,
    create: modifiersService.create,
  };
};

export default fp(adminModifiersServicesPlugin, {
  name: "admin-modifiers-services-plugin",
  dependencies: ["feature-namespaces"],
});
