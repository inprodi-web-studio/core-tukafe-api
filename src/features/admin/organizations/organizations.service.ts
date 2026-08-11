import {
  memberDB,
  notificationCampaignsDB,
  organizationDB,
  sessionDB,
  workOrdersDB,
} from "@core/db/schemas";
import {
  conflict,
  forbidden,
  generateNanoId,
  getPgError,
  notFound,
  normalizeString,
  paginate,
  validation,
} from "@core/utils";
import {
  and,
  asc,
  count,
  countDistinct,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  type SQL,
} from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type {
  AdminOrganizationsService,
  OrganizationListItem,
  UpdateOrganizationParams,
} from "./organizations.types";

function mapOrganization(row: {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  deletedAt: Date | null;
}): OrganizationListItem {
  if (!row.createdAt || !row.updatedAt) {
    throw new Error("Organization timestamps are missing");
  }

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logo: row.logo,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    status: row.deletedAt ? "inactive" : "active",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function resolveLogoPath(fastify: FastifyInstance, uploadId: string): Promise<string> {
  const upload = await fastify.db.query.uploadsDB.findFirst({
    where(table, { eq: eqOperator }) {
      return eqOperator(table.id, uploadId);
    },
    columns: { id: true, path: true, visibility: true, mimeType: true },
  });

  if (!upload) {
    throw notFound("organization.logoNotFound", "The selected logo upload was not found");
  }
  if (upload.visibility !== "PUBLIC") {
    throw validation("organization.logoMustBePublic", "The organization logo must be public");
  }
  if (!upload.mimeType.toLowerCase().startsWith("image/")) {
    throw validation("organization.logoInvalidType", "The organization logo must be an image");
  }

  return upload.path;
}

function normalizedUpdate(input: UpdateOrganizationParams) {
  return {
    ...(input.name !== undefined && {
      name: normalizeString(input.name, { trim: true, collapseWhitespace: true }),
    }),
    ...(input.slug !== undefined && { slug: input.slug.trim() }),
    ...(input.address !== undefined && {
      address: normalizeString(input.address, { trim: true, collapseWhitespace: true }),
    }),
    ...(input.latitude !== undefined && { latitude: input.latitude }),
    ...(input.longitude !== undefined && { longitude: input.longitude }),
  };
}

function mapOrganizationConflict(error: unknown): never {
  const pgError = getPgError(error);
  if (pgError?.code === "23505") {
    throw conflict("organization.slugAlreadyExists", "The organization slug already exists");
  }
  throw error;
}

export function adminOrganizationsService(fastify: FastifyInstance): AdminOrganizationsService {
  return {
    async list({ page, pageSize, search, status }) {
      const normalizedSearch = search?.trim();

      return paginate({
        executor: fastify.db,
        createQuery: () => {
          const filters: SQL[] = [];
          if (status === "active") filters.push(isNull(organizationDB.deletedAt));
          if (status === "inactive") filters.push(isNotNull(organizationDB.deletedAt));
          if (normalizedSearch) {
            const pattern = `%${normalizedSearch}%`;
            const searchFilter = or(
              ilike(organizationDB.name, pattern),
              ilike(organizationDB.slug, pattern),
              ilike(organizationDB.address, pattern),
            );
            if (searchFilter) filters.push(searchFilter);
          }

          return fastify.db
            .select()
            .from(organizationDB)
            .where(filters.length > 0 ? and(...filters) : undefined)
            .$dynamic();
        },
        orderBy: [asc(organizationDB.name), asc(organizationDB.id)],
        page,
        pageSize,
        mapRow: mapOrganization,
      });
    },

    async create(input) {
      const logo = input.logoUploadId ? await resolveLogoPath(fastify, input.logoUploadId) : null;

      try {
        const created = await fastify.db.transaction(async (tx) => {
          const [organization] = await tx
            .insert(organizationDB)
            .values({
              id: generateNanoId(),
              name: normalizeString(input.name, { trim: true, collapseWhitespace: true }),
              slug: input.slug.trim(),
              logo,
              address: normalizeString(input.address, { trim: true, collapseWhitespace: true }),
              latitude: input.latitude ?? null,
              longitude: input.longitude ?? null,
            })
            .returning();

          if (!organization) throw new Error("Failed to create organization");

          await tx.insert(memberDB).values({
            id: generateNanoId(),
            userId: input.creatorUserId,
            organizationId: organization.id,
            role: "owner",
          });

          return organization;
        });

        return mapOrganization(created);
      } catch (error) {
        mapOrganizationConflict(error);
      }
    },

    async update(input) {
      const existing = await fastify.db.query.organizationDB.findFirst({
        where(table, { eq: eqOperator }) {
          return eqOperator(table.id, input.organizationId);
        },
      });
      if (!existing) throw notFound("organization.notFound", "The organization was not found");

      const logo = Object.hasOwn(input, "logoUploadId")
        ? input.logoUploadId
          ? await resolveLogoPath(fastify, input.logoUploadId)
          : null
        : undefined;

      try {
        const [updated] = await fastify.db
          .update(organizationDB)
          .set({
            ...normalizedUpdate(input),
            ...(logo !== undefined && { logo }),
            updatedAt: new Date(),
          })
          .where(eq(organizationDB.id, input.organizationId))
          .returning();

        if (!updated) throw notFound("organization.notFound", "The organization was not found");
        return mapOrganization(updated);
      } catch (error) {
        mapOrganizationConflict(error);
      }
    },

    async deactivate({ organizationId, actorUserId, activeOrganizationId }) {
      await fastify.db.transaction(async (tx) => {
        const [target] = await tx
          .select({ id: organizationDB.id, deletedAt: organizationDB.deletedAt })
          .from(organizationDB)
          .where(eq(organizationDB.id, organizationId))
          .limit(1);

        if (!target) throw notFound("organization.notFound", "The organization was not found");
        if (target.deletedAt) return;

        const [activeCount, operationalCounts] = await Promise.all([
          tx
            .select({ value: count() })
            .from(organizationDB)
            .where(isNull(organizationDB.deletedAt)),
          Promise.all([
            tx
              .select({ orders: countDistinct(workOrdersDB.orderId), workOrders: count() })
              .from(workOrdersDB)
              .where(
                and(
                  eq(workOrdersDB.organizationId, organizationId),
                  eq(workOrdersDB.status, "open"),
                ),
              ),
            tx
              .select({ value: count() })
              .from(notificationCampaignsDB)
              .where(
                and(
                  eq(notificationCampaignsDB.organizationId, organizationId),
                  inArray(notificationCampaignsDB.status, ["scheduled", "processing"]),
                ),
              ),
          ]),
        ]);

        if (Number(activeCount[0]?.value ?? 0) <= 1) {
          throw conflict(
            "organization.lastActiveOrganization",
            "The last active organization cannot be deactivated",
          );
        }

        const openOrders = Number(operationalCounts[0][0]?.orders ?? 0);
        const openWorkOrders = Number(operationalCounts[0][0]?.workOrders ?? 0);
        const pendingCampaigns = Number(operationalCounts[1][0]?.value ?? 0);
        if (openWorkOrders > 0 || pendingCampaigns > 0) {
          throw conflict(
            "organization.pendingOperations",
            "The organization has pending operations",
            { openOrders, openWorkOrders, pendingCampaigns },
          );
        }

        const findPortalAlternative = async (userId: string) => {
          const [alternative] = await tx
            .select({ id: organizationDB.id })
            .from(memberDB)
            .innerJoin(organizationDB, eq(memberDB.organizationId, organizationDB.id))
            .where(
              and(
                eq(memberDB.userId, userId),
                inArray(memberDB.role, ["owner", "admin"]),
                isNull(organizationDB.deletedAt),
                ne(organizationDB.id, organizationId),
              ),
            )
            .orderBy(asc(organizationDB.name), asc(organizationDB.id))
            .limit(1);
          return alternative?.id ?? null;
        };

        if (
          activeOrganizationId === organizationId &&
          !(await findPortalAlternative(actorUserId))
        ) {
          throw conflict(
            "organization.noAlternativeOrganization",
            "Select or create another accessible organization before deactivating this one",
          );
        }

        const affectedSessions = await tx
          .select({ id: sessionDB.id, userId: sessionDB.userId, role: memberDB.role })
          .from(sessionDB)
          .leftJoin(
            memberDB,
            and(eq(memberDB.userId, sessionDB.userId), eq(memberDB.organizationId, organizationId)),
          )
          .where(eq(sessionDB.activeOrganizationId, organizationId));

        const sessionsByUser = new Map<string, { ids: string[]; role: string | null }>();
        for (const session of affectedSessions) {
          const current = sessionsByUser.get(session.userId) ?? { ids: [], role: session.role };
          current.ids.push(session.id);
          sessionsByUser.set(session.userId, current);
        }

        for (const [userId, sessions] of sessionsByUser) {
          const alternativeId = ["owner", "admin"].includes(sessions.role ?? "")
            ? await findPortalAlternative(userId)
            : null;

          if (alternativeId) {
            await tx
              .update(sessionDB)
              .set({ activeOrganizationId: alternativeId, updatedAt: new Date() })
              .where(inArray(sessionDB.id, sessions.ids));
          } else {
            await tx.delete(sessionDB).where(inArray(sessionDB.id, sessions.ids));
          }
        }

        await tx
          .update(organizationDB)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(organizationDB.id, organizationId));
      });
    },

    async restore(organizationId) {
      const [restored] = await fastify.db
        .update(organizationDB)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(eq(organizationDB.id, organizationId))
        .returning();

      if (!restored) throw notFound("organization.notFound", "The organization was not found");
      return mapOrganization(restored);
    },

    async updateLocation({ organizationId, activeOrganizationId, latitude, longitude }) {
      if (organizationId !== activeOrganizationId) {
        throw forbidden(
          "organization.activeOrganizationMismatch",
          "Only the active organization can be updated",
        );
      }

      const [updatedOrganization] = await fastify.db
        .update(organizationDB)
        .set({ latitude, longitude, updatedAt: new Date() })
        .where(and(eq(organizationDB.id, organizationId), isNull(organizationDB.deletedAt)))
        .returning({
          id: organizationDB.id,
          name: organizationDB.name,
          slug: organizationDB.slug,
          address: organizationDB.address,
          latitude: organizationDB.latitude,
          longitude: organizationDB.longitude,
        });

      if (!updatedOrganization) {
        throw notFound("organization.notFound", "The organization was not found");
      }

      return updatedOrganization;
    },
  };
}
