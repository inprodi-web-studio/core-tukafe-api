import { memberDB, organizationDB, sessionDB, userDB } from "@core/db/schemas";
import { badRequest, forbidden, unauthorized } from "@core/utils";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyInstance } from "fastify";
import { mapLoginError } from "./auth.helpers";
import type {
  AdminAuthService,
  PortalOrganization,
  PortalOrganizationRole,
  PortalSession,
} from "./auth.types";

const PORTAL_ROLES: PortalOrganizationRole[] = ["owner", "admin"];

interface SetActiveOrganizationApi {
  setActiveOrganization(input: {
    body: { organizationId: string };
    headers: Headers;
    returnHeaders: true;
  }): Promise<{ headers: Headers }>;
}

export function isPortalRole(role: string): role is PortalOrganizationRole {
  return PORTAL_ROLES.includes(role as PortalOrganizationRole);
}

export function filterPortalOrganizations(
  memberships: Array<Omit<PortalOrganization, "role"> & { role: string }>,
): PortalOrganization[] {
  return memberships.filter((membership): membership is PortalOrganization =>
    isPortalRole(membership.role),
  );
}

async function getPortalOrganizations(
  fastify: FastifyInstance,
  userId: string,
): Promise<PortalOrganization[]> {
  const memberships = await fastify.db
    .select({
      id: organizationDB.id,
      name: organizationDB.name,
      slug: organizationDB.slug,
      role: memberDB.role,
    })
    .from(memberDB)
    .innerJoin(organizationDB, eq(memberDB.organizationId, organizationDB.id))
    .where(
      and(
        eq(memberDB.userId, userId),
        inArray(memberDB.role, PORTAL_ROLES),
        isNull(organizationDB.deletedAt),
      ),
    )
    .orderBy(asc(organizationDB.name));

  return filterPortalOrganizations(memberships);
}

async function getPortalUser(
  fastify: FastifyInstance,
  userId: string,
): Promise<PortalSession["user"]> {
  const users = await fastify.db
    .select({
      id: userDB.id,
      email: userDB.email,
      name: userDB.name,
      middleName: userDB.middleName,
      lastName: userDB.lastName,
      role: userDB.role,
    })
    .from(userDB)
    .where(eq(userDB.id, userId))
    .limit(1);
  const user = users[0];

  if (!user) {
    throw unauthorized("auth.userNotFound", "The authenticated user was not found");
  }

  return user;
}

async function setActiveOrganization(
  fastify: FastifyInstance,
  organizationId: string,
  headers: Headers,
): Promise<string | null> {
  const api = fastify.auth.api as unknown as SetActiveOrganizationApi;
  const { headers: responseHeaders } = await api.setActiveOrganization({
    body: { organizationId },
    headers,
    returnHeaders: true,
  });

  return responseHeaders.get("set-cookie");
}

export function buildPortalSession(
  user: PortalSession["user"],
  organizations: PortalOrganization[],
  activeOrganizationId: string | null | undefined,
): PortalSession {
  const activeOrganization = organizations.find(
    (organization) => organization.id === activeOrganizationId,
  );

  if (!activeOrganization) {
    throw forbidden(
      "auth.portalAccessDenied",
      "The active organization is not available in the admin portal",
    );
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      middleName: user.middleName ?? null,
      lastName: user.lastName ?? null,
      role: user.role,
    },
    activeOrganization,
    organizations,
  };
}

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

    async loginToPortal({ email, password }, requestHeaders) {
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
        const loginCookie = headers.get("set-cookie");
        const authHeaders = new Headers({ cookie: loginCookie ?? "" });
        const organizations = await getPortalOrganizations(fastify, response.user.id);

        if (organizations.length === 0) {
          await fastify.auth.api.revokeSession({
            body: { token: response.token },
            headers: authHeaders,
          });

          throw forbidden(
            "auth.portalAccessDenied",
            "The user does not have access to the admin portal",
          );
        }

        const currentSession = await fastify.db.query.sessionDB.findFirst({
          where(session, { and: andOperator, eq: eqOperator }) {
            return andOperator(
              eqOperator(session.token, response.token),
              eqOperator(session.userId, response.user.id),
            );
          },
        });
        const activeOrganization =
          organizations.find(
            (organization) => organization.id === currentSession?.activeOrganizationId,
          ) ?? organizations[0];

        if (!activeOrganization) {
          throw forbidden(
            "auth.portalAccessDenied",
            "The user does not have access to the admin portal",
          );
        }

        const organizationCookie = await setActiveOrganization(
          fastify,
          activeOrganization.id,
          authHeaders,
        );
        const portalUser = await getPortalUser(fastify, response.user.id);

        return {
          session: buildPortalSession(portalUser, organizations, activeOrganization.id),
          cookie: organizationCookie ?? loginCookie,
        };
      } catch (e) {
        mapLoginError(e);
      }
    },

    async getPortalSession(requestHeaders) {
      const headerSession = await fastify.auth.api.getSession({
        headers: fromNodeHeaders(requestHeaders ?? {}),
      });

      if (!headerSession) {
        throw unauthorized("auth.noSession", "No valid session was found");
      }

      const organizations = await getPortalOrganizations(fastify, headerSession.user.id);
      const portalUser = await getPortalUser(fastify, headerSession.user.id);
      const persistedSession = await fastify.db.query.sessionDB.findFirst({
        where(session, { eq: eqOperator }) {
          return eqOperator(session.token, headerSession.session.token);
        },
      });

      if (organizations.length === 0) {
        throw forbidden(
          "auth.portalAccessDenied",
          "The user does not have access to the admin portal",
        );
      }

      return buildPortalSession(portalUser, organizations, persistedSession?.activeOrganizationId);
    },

    async setPortalActiveOrganization({ organizationId }, requestHeaders) {
      const headers = fromNodeHeaders(requestHeaders ?? {});
      const headerSession = await fastify.auth.api.getSession({ headers });

      if (!headerSession) {
        throw unauthorized("auth.noSession", "No valid session was found");
      }

      const organizations = await getPortalOrganizations(fastify, headerSession.user.id);
      const portalUser = await getPortalUser(fastify, headerSession.user.id);
      const activeOrganization = organizations.find(
        (organization) => organization.id === organizationId,
      );

      if (!activeOrganization) {
        throw forbidden(
          "auth.portalOrganizationAccessDenied",
          "The user cannot access the requested organization from the admin portal",
        );
      }

      const organizationCookie = await setActiveOrganization(
        fastify,
        activeOrganization.id,
        headers,
      );

      return {
        session: buildPortalSession(portalUser, organizations, activeOrganization.id),
        cookie: organizationCookie,
      };
    },
  };
}
