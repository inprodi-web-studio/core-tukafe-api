import { accountDB, memberDB, userDB } from "@core/db/schemas";
import {
  conflict,
  forbidden,
  generateNanoId,
  getPgError,
  isHttpError,
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
} from "./team.types";

function mapTeamMember(row: {
  id: string;
  name: string;
  middleName: string | null;
  lastName: string | null;
  email: string;
  role: "admin" | "barista";
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

export function adminTeamService(fastify: FastifyInstance): AdminTeamService {
  return {
    async list({ organizationId, page, pageSize, search, role, sortBy, sortDirection }) {
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
          }),
      });
    },

    async create(rawInput) {
      const input = normalizeCreateInput(rawInput);
      const passwordHash = await hashPassword(input.password);

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
            .select({ id: userDB.id })
            .from(userDB)
            .where(sql`lower(${userDB.email}) = ${input.email}`)
            .limit(1);

          if (existingUsers[0]) {
            throw conflict("team.emailAlreadyExists", "A user with this email already exists");
          }

          const userId = generateNanoId();

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
            password: passwordHash,
          });

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
            name: input.name,
            surnames: input.surnames,
            email: input.email,
            role: input.role,
            createdAt: membership.createdAt,
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
  };
}
