import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

import { adminUploadsService } from "./uploads.service";
import type { AdminUploadsService } from "./uploads.types";

declare module "@core/types/feature-namespaces" {
  interface AdminNamespace {
    uploads: AdminUploadsService;
  }
}

const adminUploadsServicesPlugin: FastifyPluginAsync = async (fastify) => {
  const uploadsService = adminUploadsService(fastify);

  fastify.admin.uploads = {
    create: uploadsService.create,
  };
};

export default fp(adminUploadsServicesPlugin, {
  name: "admin-uploads-services-plugin",
  dependencies: ["feature-namespaces"],
});
