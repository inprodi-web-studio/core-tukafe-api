import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { customerAuthService } from "./auth.service";

declare module "@core/types/feature-namespaces" {
  interface CusstomerNamespace {
    customer: {};
  }
}

const customerAuthServicesPlugin: FastifyPluginAsync = async (fastify) => {
  const authService = customerAuthService(fastify);

  fastify.customer.auth = {};
};

export default fp(customerAuthServicesPlugin, {
  name: "customer-auth-services-plugin",
  dependencies: ["feature-namespaces", "auth"],
});
