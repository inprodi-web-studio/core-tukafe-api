import { sessionDB } from "@core/db/schemas";
import { badRequest, forbidden } from "@core/utils";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { mapLoginError } from "./auth.helpers";
import type { AdminAuthService } from "./auth.types";

export function adminAuthService(fastify: FastifyInstance): AdminAuthService {
  return {
    async loginWithEmail({ email, password, organizationId }, requestHeaders) {
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
        const cookie = headers.get("set-cookie");
        const authHeaders = new Headers({
          cookie: cookie ?? "",
        });
        const normalizedOrganizationId = organizationId?.trim() ?? "";

        const revokeCurrentSession = () =>
          fastify.auth.api.revokeSession({
            body: { token: response.token },
            headers: authHeaders,
          });

        let activeOrganizationId: string | null = null;

        if (normalizedOrganizationId) {
          const member = await fastify.db.query.memberDB.findFirst({
            where(memberDB, { and: andOperator, eq: eqOperator }) {
              return andOperator(
                eqOperator(memberDB.userId, response.user.id),
                eqOperator(memberDB.organizationId, normalizedOrganizationId),
              );
            },
          });

          if (!member) {
            await revokeCurrentSession();

            throw forbidden(
              "auth.organizationAccessDenied",
              "User is not a member of the requested organization",
            );
          }

          await fastify.db
            .update(sessionDB)
            .set({
              activeOrganizationId: normalizedOrganizationId,
              updatedAt: new Date(),
            })
            .where(
              and(eq(sessionDB.token, response.token), eq(sessionDB.userId, response.user.id)),
            );

          const { success } = await fastify.auth.api.hasPermission({
            headers: authHeaders,
            body: {
              permissions: {
                orders: ["read", "update"],
              },
            },
          });

          if (!success) {
            await revokeCurrentSession();

            throw forbidden(
              "user.noPermissions",
              "You do not have the required permissions to perform this action",
            );
          }

          activeOrganizationId = normalizedOrganizationId;
        } else {
          const activeMember = await fastify.auth.api.getActiveMember({
            headers: authHeaders,
          });

          if (!activeMember) {
            await revokeCurrentSession();

            throw badRequest("auth.invalidCredentials", "Invalid email or password");
          }

          activeOrganizationId = activeMember.organizationId ?? null;
        }

        return {
          user: {
            id: response.user.id ?? "",
            email: response.user.email ?? "",
            name: response.user.name ?? "",
            middleName: response.user.middleName ?? null,
            lastName: response.user.lastName ?? null,
          },
          cookie,
          organizationId: activeOrganizationId,
        };
      } catch (e) {
        mapLoginError(e);
      }
    },
  };
}
