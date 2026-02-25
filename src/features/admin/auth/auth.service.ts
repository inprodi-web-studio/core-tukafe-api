import type { BetterAuthError } from "@core/types";
import { badRequest } from "@core/utils";
import type { FastifyInstance } from "fastify";
import type { AdminAuthService } from "./auth.types";

export function adminAuthService(fastify: FastifyInstance): AdminAuthService {
  return {
    async loginWithEmail({ email, password }, requestHeaders) {
      try {
        const { response, headers } = await fastify.auth.api.signInEmail({
          body: {
            email,
            password,
            rememberMe: true,
          },
          headers: requestHeaders,
          returnHeaders: true,
        });

        const members = await fastify.auth.api.getActiveMember({
          headers: new Headers({
            cookie: headers.get("set-cookie") ?? "",
          }),
        });

        if (!members) {
          await fastify.auth.api.revokeSession({
            body: { token: response.token },
            headers: new Headers({
              cookie: headers.get("set-cookie") ?? "",
            }),
          });

          throw badRequest("auth.invalidCredentials", "Invalid email or password");
        }

        return {
          user: {
            id: response.user.id ?? "",
            email: response.user.email ?? "",
            name: response.user.name ?? "",
            middleName: response.user.middleName ?? null,
            lastName: response.user.lastName ?? null,
          },
          cookie: headers.get("set-cookie"),
        };
      } catch (e) {
        if (e instanceof Error && e.name === "HttpError") {
          throw e;
        }

        const error = e as BetterAuthError;
        const code = error.body?.code;

        switch (code) {
          case "INVALID_EMAIL_OR_PASSWORD":
            throw badRequest("auth.invalidCredentials", "Invalid email or password");

          case "EMAIL_NOT_VERIFIED":
            throw badRequest("auth.emailNotVerified", "Email not verified");

          default:
            throw error;
        }
      }
    },
  };
}
