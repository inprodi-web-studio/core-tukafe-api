import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { customerAuthService } from "./auth.service";
import type { CustomerAuthService } from "./auth.types";

declare module "@core/types/feature-namespaces" {
  interface CustomerNamespace {
    auth: {
      resendOTP: CustomerAuthService["resendOTP"];
      verifyPhone: CustomerAuthService["verifyPhone"];
      signupWithPhone: CustomerAuthService["signupWithPhone"];
      loginWithEmailOrPhone: CustomerAuthService["loginWithEmailOrPhone"];
    };
  }
}

const customerAuthServicesPlugin: FastifyPluginAsync = async (fastify) => {
  const authService = customerAuthService(fastify);

  fastify.customer.auth = {
    resendOTP: authService.resendOTP,
    verifyPhone: authService.verifyPhone,
    signupWithPhone: authService.signupWithPhone,
    loginWithEmailOrPhone: authService.loginWithEmailOrPhone,
  };
};

export default fp(customerAuthServicesPlugin, {
  name: "customer-auth-services-plugin",
  dependencies: ["feature-namespaces", "auth", "db"],
});
