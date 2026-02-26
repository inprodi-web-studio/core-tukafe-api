import { customerProfileDB } from "@core/db/schemas";
import { badRequest, normalizePresets, normalizeString, unauthorized } from "@core/utils";
import type { FastifyInstance } from "fastify";
import {
  getCustomerAccessByIdentifier,
  mapLoginError,
  mapResendError,
  mapSignupError,
  mapVerificationError,
} from "./auth.helpers";
import type { CustomerAuthService, SignupResponse } from "./auth.types";

export function customerAuthService(fastify: FastifyInstance): CustomerAuthService {
  return {
    async signupWithPhone({ name, middleName, lastName, email, phone, password }) {
      let userId: string | undefined;

      let sessionToken: string | undefined;

      try {
        const { user, token } = await fastify.auth.api.signUpEmail({
          body: {
            name,
            middleName,
            lastName,
            email,
            password,
            phoneNumber: phone,
          },
        });

        userId = user.id;
        sessionToken = token ?? undefined;
      } catch (e) {
        mapSignupError(e);
      }

      if (!sessionToken) {
        throw new Error("Failed to obtain session token after signup");
      }

      try {
        await fastify.auth.api.sendPhoneNumberOTP({
          body: { phoneNumber: phone },
        });
      } catch {
        fastify.log.error("Failed to send OTP. Unknown Error.");
      }

      const response: SignupResponse = {
        userId,
        email,
        phone,
      };

      return response;
    },

    async loginWithEmailOrPhone({ email, phone, password }, requestHeaders) {
      const normalizedEmail = email ? normalizeString(email, normalizePresets.email) : undefined;
      const normalizedPhone = phone ? normalizeString(phone, normalizePresets.phone) : undefined;

      const userAccess = await getCustomerAccessByIdentifier(fastify, {
        email: normalizedEmail,
        phone: normalizedPhone,
      });

      if (userAccess && !userAccess.isCustomer) {
        throw unauthorized(
          "auth.customerAccessOnly",
          "This account is not enabled for customer access",
        );
      }

      if (userAccess && (!userAccess.phoneNumber || userAccess.phoneNumberVerified !== true)) {
        throw badRequest("auth.phoneNotVerified", "Phone number must be verified before login");
      }

      let responseToken: string | null = null;
      let headerToken: string | null = null;
      let userId = "";
      let userEmail: string | null = null;
      let userPhone = normalizedPhone ?? userAccess?.phoneNumber ?? "";

      try {
        if (normalizedEmail) {
          const { response, headers } = await fastify.auth.api.signInEmail({
            body: {
              email: normalizedEmail,
              password,
              rememberMe: true,
            },
            headers: requestHeaders,
            returnHeaders: true,
          });

          userId = response.user.id ?? "";
          userEmail = response.user.email ?? null;
          userPhone = response.user.phoneNumber ?? userPhone;
          responseToken = response.token ?? null;
          headerToken = headers.get("set-auth-token");
        } else {
          const { response, headers } = await fastify.auth.api.signInPhoneNumber({
            body: {
              phoneNumber: normalizedPhone!,
              password,
              rememberMe: true,
            },
            headers: requestHeaders,
            returnHeaders: true,
          });

          userId = response.user.id ?? "";
          userEmail = response.user.email ?? null;
          userPhone = response.user.phoneNumber ?? userPhone;
          responseToken = response.token ?? null;
          headerToken = headers.get("set-auth-token");
        }
      } catch (e) {
        mapLoginError(e);
      }

      const token = headerToken ?? responseToken;

      if (!token || !userId || !userPhone) {
        throw badRequest("auth.loginFailed", "Failed to login");
      }

      return {
        token,
        userId,
        email: userEmail,
        phone: userPhone,
      };
    },

    async resendOTP({ phone }) {
      try {
        await fastify.auth.api.sendPhoneNumberOTP({
          body: { phoneNumber: phone },
        });
      } catch (e) {
        mapResendError(e);
      }
    },

    async verifyPhone({ phone, code }) {
      let result: Awaited<ReturnType<typeof fastify.auth.api.verifyPhoneNumber>>;

      try {
        result = await fastify.auth.api.verifyPhoneNumber({
          body: {
            phoneNumber: phone,
            code,
            disableSession: false,
          },
        });
      } catch (e) {
        mapVerificationError(e);
      }

      if (!result.status || !result.token) {
        throw badRequest("auth.verificationFailed", "Phone verification failed");
      }

      const user = result.user;

      await fastify.db
        .insert(customerProfileDB)
        .values({
          userId: user.id,
        })
        .onConflictDoNothing({
          target: customerProfileDB.userId,
        });

      return {
        token: result.token,
        userId: user.id,
        email: user.email,
        phone: user.phoneNumber ?? phone,
      };
    },
  };
}
