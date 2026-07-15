import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { adminAuthService } from "./auth.service";
import type { AdminAuthService } from "./auth.types";

declare module "@core/types/feature-namespaces" {
  interface AdminNamespace {
    auth: AdminAuthService;
  }
}

const adminAuthServicesPlugin: FastifyPluginAsync = async (fastify) => {
  const authService = adminAuthService(fastify);

  fastify.admin.auth = {
    loginWithEmail: authService.loginWithEmail,
    loginToPortal: authService.loginToPortal,
    getPortalSession: authService.getPortalSession,
    setPortalActiveOrganization: authService.setPortalActiveOrganization,
  };
};

export default fp(adminAuthServicesPlugin, {
  name: "admin-auth-services-plugin",
  dependencies: ["feature-namespaces"],
});
