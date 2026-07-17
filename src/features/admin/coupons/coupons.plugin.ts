import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { adminCouponsService } from "./coupons.service";
import type { AdminCouponsService } from "./coupons.types";

declare module "@core/types/feature-namespaces" {
  interface AdminNamespace {
    coupons: AdminCouponsService;
  }
}

const adminCouponsServicesPlugin: FastifyPluginAsync = async (fastify) => {
  const couponsService = adminCouponsService(fastify);

  fastify.admin.coupons = couponsService;
};

export default fp(adminCouponsServicesPlugin, {
  name: "admin-coupons-services-plugin",
  dependencies: ["feature-namespaces"],
});
