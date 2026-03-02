import type { OrganizationPermissions } from "@core/config/permissions.config";
import type { Member } from "@core/db/schemas";
import { forbidden, isHttpError, unauthorized } from "@core/utils";
import type { Session, User } from "better-auth";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyReply, FastifyRequest } from "fastify";

export interface AdminAuthSession {
  user: User;
  member: Member;
  session: Session;
}

export interface AdminAuthHandlerParams {
  permissions?: OrganizationPermissions;
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AdminAuthSession;
  }
}

function adminAuthHandler({ permissions = {} }: AdminAuthHandlerParams = {}) {
  return async function adminAuth(request: FastifyRequest, reply: FastifyReply) {
    const headers = fromNodeHeaders(request.headers);

    try {
      const headerSession = await request.server.auth.api.getSession({
        headers,
      });

      if (!headerSession) {
        throw unauthorized("auth.noSession", "No valid session was found");
      }

      const { session, user } = headerSession;
      const organizationId = session.activeOrganizationId;

      if (!organizationId) {
        throw unauthorized(
          "auth.noActiveOrganization",
          "No active organization is selected for this session",
        );
      }

      const member = await request.server.db.query.memberDB.findFirst({
        where(memberDB, { and, eq }) {
          return and(eq(memberDB.userId, user.id), eq(memberDB.organizationId, organizationId));
        },
      });

      if (!member) {
        throw unauthorized("auth.noMember", "User is not a member of the organization");
      }

      if (Object.keys(permissions).length > 0) {
        const { success } = await request.server.auth.api.hasPermission({
          headers,
          body: {
            permissions,
          },
        });

        if (!success) {
          throw forbidden(
            "user.noPermissions",
            "You do not have the required permissions to perform this action",
          );
        }
      }

      request.auth = {
        user,
        member,
        session,
      };
    } catch (error) {
      if (isHttpError(error)) {
        throw error;
      } else {
        throw unauthorized("auth.unauthorized", "Failed to authenticate user");
      }
    }
  };
}

export default adminAuthHandler;
