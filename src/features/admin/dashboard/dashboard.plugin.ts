import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { adminDashboardService } from "./dashboard.service";
import type { AdminDashboardService } from "./dashboard.types";

declare module "@core/types/feature-namespaces" {
  interface AdminNamespace {
    dashboard: AdminDashboardService;
  }
}

const adminDashboardServicesPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.admin.dashboard = adminDashboardService(fastify);
};

export default fp(adminDashboardServicesPlugin, {
  name: "admin-dashboard-services-plugin",
  dependencies: ["feature-namespaces"],
});
