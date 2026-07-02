import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { customerAuthService } from "./auth.service";
import type { CustomerAuthService } from "./auth.types";

declare module "@core/types/feature-namespaces" {
  interface CustomerNamespace {
    auth: {
      resendOTP: CustomerAuthService["resendOTP"];
      verifyPhone: CustomerAuthService["verifyPhone"];
      requestPasswordReset: CustomerAuthService["requestPasswordReset"];
      validatePasswordResetCode: CustomerAuthService["validatePasswordResetCode"];
      resetPassword: CustomerAuthService["resetPassword"];
      signupWithPhone: CustomerAuthService["signupWithPhone"];
      loginWithEmailOrPhone: CustomerAuthService["loginWithEmailOrPhone"];
      changePassword: CustomerAuthService["changePassword"];
      createQrLoginToken: CustomerAuthService["createQrLoginToken"];
    };
  }
}

const customerAuthServicesPlugin: FastifyPluginAsync = async (fastify) => {
  const authService = customerAuthService(fastify);

  fastify.customer.auth = {
    resendOTP: authService.resendOTP,
    verifyPhone: authService.verifyPhone,
    requestPasswordReset: authService.requestPasswordReset,
    validatePasswordResetCode: authService.validatePasswordResetCode,
    resetPassword: authService.resetPassword,
    signupWithPhone: authService.signupWithPhone,
    loginWithEmailOrPhone: authService.loginWithEmailOrPhone,
    changePassword: authService.changePassword,
    createQrLoginToken: authService.createQrLoginToken,
  };
};

export default fp(customerAuthServicesPlugin, {
  name: "customer-auth-services-plugin",
  dependencies: ["feature-namespaces"],
});
