import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { adminApiKeysService } from "./apiKeys.service";
import type { AdminApiKeysService } from "./apiKeys.types";

declare module "@core/types/feature-namespaces" {
  interface AdminNamespace {
    apiKeys: AdminApiKeysService;
  }
}

const adminApiKeysServicesPlugin: FastifyPluginAsync = async (fastify) => {
  const apiKeys = adminApiKeysService(fastify);

  fastify.admin.apiKeys = {
    create: apiKeys.create,
  };
};

export default fp(adminApiKeysServicesPlugin, {
  name: "admin-api-keys-services-plugin",
  dependencies: ["feature-namespaces"],
});
