import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { adminCashbackService } from "./cashback.service";
import type { AdminCashbackService } from "./cashback.types";

declare module "@core/types/feature-namespaces" {
  interface AdminNamespace {
    cashback: AdminCashbackService;
  }
}

const adminCashbackServicesPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.admin.cashback = adminCashbackService(fastify);
};

export default fp(adminCashbackServicesPlugin, {
  name: "admin-cashback-services-plugin",
  dependencies: ["feature-namespaces"],
});
