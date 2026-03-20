import type { CustomerProfile } from "@core/db/schemas";
import { isHttpError, unauthorized } from "@core/utils";
import type { Session, User } from "better-auth";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyReply, FastifyRequest } from "fastify";

export interface CustomerAuthSession {
  user: User;
  session: Session;
  customerProfile: CustomerProfile;
}

declare module "fastify" {
  interface FastifyRequest {
    customerAuth: CustomerAuthSession;
  }
}

function customerAuthHandler() {
  return async function customerAuth(request: FastifyRequest, _reply: FastifyReply) {
    const headers = fromNodeHeaders(request.headers);

    try {
      const headerSession = await request.server.auth.api.getSession({
        headers,
      });

      if (!headerSession) {
        throw unauthorized("auth.noSession", "No valid session was found");
      }

      const { session, user } = headerSession;

      const customerProfile = await request.server.db.query.customerProfileDB.findFirst({
        where(table, { and, eq, isNull }) {
          return and(eq(table.userId, user.id), isNull(table.deletedAt));
        },
      });

      if (!customerProfile) {
        throw unauthorized(
          "auth.customerAccessOnly",
          "This account is not enabled for customer access",
        );
      }

      request.customerAuth = {
        user,
        session,
        customerProfile,
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

export default customerAuthHandler;
