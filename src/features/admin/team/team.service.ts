import { accountDB, memberDB, userDB } from "@core/db/schemas";
import {
  conflict,
  forbidden,
  generateNanoId,
  getPgError,
  isHttpError,
  notFound,
  normalizeString,
  paginate,
} from "@core/utils";
import { hashPassword } from "better-auth/crypto";
import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type {
  AdminTeamService,
  CreateTeamMemberParams,
  TeamListParams,
  TeamMemberListItem,
  UpdateTeamMemberParams,
} from "./team.types";

function mapTeamMember(row: {
  id: string;
  name: string;
  middleName: string | null;
  lastName: string | null;
  email: string;
  role: "admin" | "barista";
  organizationIds: string[];
  createdAt: Date | null;
}): TeamMemberListItem {
  if (!row.createdAt) {
    throw new Error("Team membership is missing its creation date");
  }

  return {
    id: row.id,
    name: row.name,
    surnames: [row.middleName, row.lastName].filter(Boolean).join(" "),
    email: row.email,
    role: row.role,
    organizationIds: row.organizationIds,
    createdAt: row.createdAt,
  };
}

function resolveOrderBy({
  sortBy,
  sortDirection,
}: Pick<TeamListParams, "sortBy" | "sortDirection">): [SQL, ...SQL[]] {
  const order = sortDirection === "desc" ? desc : asc;
  const column = {
    name: userDB.name,
    email: userDB.email,
    role: memberDB.role,
    createdAt: memberDB.createdAt,
  }[sortBy];

  return [order(column), asc(memberDB.id)];
}

function normalizeCreateInput(input: CreateTeamMemberParams) {
  return {
    ...input,
    name: normalizeString(input.name, { trim: true, collapseWhitespace: true }),
    surnames: normalizeString(input.surnames, { trim: true, collapseWhitespace: true }),
    email: input.email.trim().toLowerCase(),
    organizationIds: [...new Set(input.organizationIds)],
  };
}

function normalizeUpdateInput(input: UpdateTeamMemberParams) {
  return {
    ...input,
    name: normalizeString(input.name, { trim: true, collapseWhitespace: true }),
    surnames: normalizeString(input.surnames, { trim: true, collapseWhitespace: true }),
    organizationIds: [...new Set(input.organizationIds)],
  };
}

export function adminTeamService(fastify: FastifyInstance): AdminTeamService {
  return {
    async list({
      viewerUserId,
      organizationId,
      page,
      pageSize,
      search,
      role,
      sortBy,
      sortDirection,
    }) {
      const normalizedSearch = search?.trim();
      const orderBy = resolveOrderBy({ sortBy, sortDirection });

      return paginate({
        executor: fastify.db,
        createQuery: () => {
          const filters: SQL[] = [
            eq(memberDB.organizationId, organizationId),
            role ? eq(memberDB.role, role) : inArray(memberDB.role, ["admin", "barista"]),
          ];

          if (normalizedSearch) {
            const searchPattern = `%${normalizedSearch}%`;
            const searchFilter = or(
              ilike(userDB.name, searchPattern),
              ilike(userDB.middleName, searchPattern),
              ilike(userDB.lastName, searchPattern),
              ilike(userDB.email, searchPattern),
            );

            if (searchFilter) {
              filters.push(searchFilter);
            }
          }

          return fastify.db
            .select({
              id: memberDB.id,
              name: userDB.name,
              middleName: userDB.middleName,
              lastName: userDB.lastName,
              email: userDB.email,
              role: memberDB.role,
              organizationIds: sql<string[]>`coalesce(array(
                select editable_member.organization_id
                from "member" editable_member
                inner join "member" viewer_membership
                  on viewer_membership.organization_id = editable_member.organization_id
                where editable_member.user_id = ${userDB.id}
                  and editable_member.role in ('admin', 'barista')
                  and viewer_membership.user_id = ${viewerUserId}
                  and viewer_membership.role in ('owner', 'admin')
                order by editable_member.organization_id
              ), array[]::text[])`,
              createdAt: memberDB.createdAt,
            })
            .from(memberDB)
            .innerJoin(userDB, eq(memberDB.userId, userDB.id))
            .where(and(...filters))
            .$dynamic();
        },
        orderBy,
        page,
        pageSize,
        mapRow: (row) =>
          mapTeamMember({
            ...row,
            role: row.role as "admin" | "barista",
            organizationIds: row.organizationIds,
          }),
      });
    },

    async create(rawInput) {
      const input = normalizeCreateInput(rawInput);

      try {
        return await fastify.db.transaction(async (tx) => {
          const authorizedMemberships = await tx
            .select({ organizationId: memberDB.organizationId })
            .from(memberDB)
            .where(
              and(
                eq(memberDB.userId, input.creatorUserId),
                inArray(memberDB.organizationId, input.organizationIds),
                inArray(memberDB.role, ["owner", "admin"]),
              ),
            );
          const authorizedOrganizationIds = new Set(
            authorizedMemberships.map((membership) => membership.organizationId),
          );

          if (
            input.organizationIds.some(
              (organizationId) => !authorizedOrganizationIds.has(organizationId),
            )
          ) {
            throw forbidden(
              "team.organizationAccessDenied",
              "The user cannot assign access to one or more organizations",
            );
          }

          const existingUsers = await tx
            .select({
              id: userDB.id,
              name: userDB.name,
              middleName: userDB.middleName,
              lastName: userDB.lastName,
              email: userDB.email,
            })
            .from(userDB)
            .where(sql`lower(${userDB.email}) = ${input.email}`)
            .limit(1);
          const existingUser = existingUsers[0];
          const userId = existingUser?.id ?? generateNanoId();
          let credentialCreated = false;

          if (existingUser) {
            const existingAdministrativeMemberships = await tx
              .select({ id: memberDB.id })
              .from(memberDB)
              .where(
                and(
                  eq(memberDB.userId, existingUser.id),
                  inArray(memberDB.role, ["owner", "admin", "barista"]),
                ),
              )
              .limit(1);

            if (existingAdministrativeMemberships[0]) {
              throw conflict(
                "team.emailAlreadyExists",
                "A user with this email already has administrative access",
              );
            }

            const existingCredentials = await tx
              .select({ id: accountDB.id })
              .from(accountDB)
              .where(
                and(eq(accountDB.userId, existingUser.id), eq(accountDB.providerId, "credential")),
              )
              .limit(1);

            if (!existingCredentials[0]) {
              await tx.insert(accountDB).values({
                id: generateNanoId(),
                userId,
                accountId: userId,
                providerId: "credential",
                password: await hashPassword(input.password),
              });
              credentialCreated = true;
            }
          } else {
            await tx.insert(userDB).values({
              id: userId,
              name: input.name,
              middleName: input.surnames,
              lastName: null,
              email: input.email,
              emailVerified: true,
            });

            await tx.insert(accountDB).values({
              id: generateNanoId(),
              userId,
              accountId: userId,
              providerId: "credential",
              password: await hashPassword(input.password),
            });
            credentialCreated = true;
          }

          const memberships = input.organizationIds.map((organizationId) => ({
            id: generateNanoId(),
            userId,
            organizationId,
            role: input.role,
          }));
          const [membership] = await tx
            .insert(memberDB)
            .values(memberships)
            .returning({ id: memberDB.id, createdAt: memberDB.createdAt });

          if (!membership?.createdAt) {
            throw new Error("Failed to create team membership");
          }

          return {
            id: membership.id,
            name: existingUser?.name ?? input.name,
            surnames: existingUser
              ? [existingUser.middleName, existingUser.lastName].filter(Boolean).join(" ")
              : input.surnames,
            email: existingUser?.email ?? input.email,
            role: input.role,
            organizationIds: input.organizationIds,
            createdAt: membership.createdAt,
            existingUser: Boolean(existingUser),
            credentialCreated,
          };
        });
      } catch (error) {
        if (isHttpError(error)) {
          throw error;
        }

        const pgError = getPgError(error);

        if (pgError?.code === "23505") {
          throw conflict("team.emailAlreadyExists", "A user with this email already exists");
        }

        throw error;
      }
    },

    async update(rawInput) {
      const input = normalizeUpdateInput(rawInput);

      return fastify.db.transaction(async (tx) => {
        const authorizedMemberships = await tx
          .select({ organizationId: memberDB.organizationId })
          .from(memberDB)
          .where(
            and(
              eq(memberDB.userId, input.editorUserId),
              inArray(memberDB.role, ["owner", "admin"]),
            ),
          );
        const authorizedOrganizationIds = new Set(
          authorizedMemberships.map((membership) => membership.organizationId),
        );

        if (
          input.organizationIds.some(
            (organizationId) => !authorizedOrganizationIds.has(organizationId),
          )
        ) {
          throw forbidden(
            "team.organizationAccessDenied",
            "The user cannot assign access to one or more organizations",
          );
        }

        const [target] = await tx
          .select({
            id: memberDB.id,
            userId: memberDB.userId,
            organizationId: memberDB.organizationId,
            role: memberDB.role,
            createdAt: memberDB.createdAt,
            email: userDB.email,
          })
          .from(memberDB)
          .innerJoin(userDB, eq(memberDB.userId, userDB.id))
          .where(
            and(
              eq(memberDB.id, input.memberId),
              eq(memberDB.organizationId, input.activeOrganizationId),
              inArray(memberDB.role, ["admin", "barista"]),
            ),
          )
          .limit(1);

        if (!target?.createdAt) {
          throw notFound("team.memberNotFound", "The team member was not found");
        }

        const editableOrganizationIds = [...authorizedOrganizationIds];
        const existingMemberships = await tx
          .select({
            id: memberDB.id,
            organizationId: memberDB.organizationId,
            role: memberDB.role,
          })
          .from(memberDB)
          .where(
            and(
              eq(memberDB.userId, target.userId),
              inArray(memberDB.organizationId, editableOrganizationIds),
            ),
          );
        const membershipsByOrganization = new Map(
          existingMemberships.map((membership) => [membership.organizationId, membership]),
        );

        if (
          input.organizationIds.some(
            (organizationId) => membershipsByOrganization.get(organizationId)?.role === "owner",
          )
        ) {
          throw forbidden(
            "team.ownerMembershipCannotBeModified",
            "Owner memberships cannot be modified from the team module",
          );
        }

        await tx
          .update(userDB)
          .set({ name: input.name, middleName: input.surnames, lastName: null })
          .where(eq(userDB.id, target.userId));

        const selectedOrganizationIds = new Set(input.organizationIds);
        const membershipIdsToDelete = existingMemberships
          .filter(
            (membership) =>
              !selectedOrganizationIds.has(membership.organizationId) &&
              ["admin", "barista"].includes(membership.role),
          )
          .map((membership) => membership.id);
        if (membershipIdsToDelete.length > 0) {
          await tx.delete(memberDB).where(inArray(memberDB.id, membershipIdsToDelete));
        }

        const membershipIdsToUpdate = input.organizationIds
          .map((organizationId) => membershipsByOrganization.get(organizationId))
          .filter((membership) => membership !== undefined)
          .map((membership) => membership.id);
        if (membershipIdsToUpdate.length > 0) {
          await tx
            .update(memberDB)
            .set({ role: input.role })
            .where(inArray(memberDB.id, membershipIdsToUpdate));
        }

        const newMemberships = input.organizationIds
          .filter((organizationId) => !membershipsByOrganization.has(organizationId))
          .map((organizationId) => ({
            id: generateNanoId(),
            userId: target.userId,
            organizationId,
            role: input.role,
          }));
        if (newMemberships.length > 0) {
          await tx.insert(memberDB).values(newMemberships);
        }

        return {
          id: input.memberId,
          name: input.name,
          surnames: input.surnames,
          email: target.email,
          role: input.role,
          organizationIds: input.organizationIds,
          createdAt: target.createdAt,
        };
      });
    },
  };
}
