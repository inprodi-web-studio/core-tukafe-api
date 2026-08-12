import { apiKeyDB, userDB } from "@core/db/schemas";
import { notFound, paginate } from "@core/utils";
import { and, desc, eq, ilike, isNotNull, lt, or, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { AdminApiKeysService } from "./apiKeys.types";

function formatDateToISOString(value: string | Date | null): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export function adminApiKeysService(fastify: FastifyInstance): AdminApiKeysService {
  return {
    async list({ page, pageSize, search, status }) {
      await fastify.db
        .delete(apiKeyDB)
        .where(and(isNotNull(apiKeyDB.expiresAt), lt(apiKeyDB.expiresAt, new Date())));

      const normalizedSearch = search?.trim();

      return paginate({
        executor: fastify.db,
        createQuery: () => {
          const filters: SQL[] = [];
          if (status === "active") filters.push(eq(apiKeyDB.enabled, true));
          if (status === "revoked") filters.push(eq(apiKeyDB.enabled, false));
          if (normalizedSearch) {
            const pattern = `%${normalizedSearch}%`;
            const searchFilter = or(
              ilike(apiKeyDB.name, pattern),
              ilike(apiKeyDB.start, pattern),
              ilike(apiKeyDB.prefix, pattern),
              ilike(userDB.name, pattern),
              ilike(userDB.email, pattern),
            );
            if (searchFilter) filters.push(searchFilter);
          }

          return fastify.db
            .select({
              id: apiKeyDB.id,
              name: apiKeyDB.name,
              prefix: apiKeyDB.prefix,
              start: apiKeyDB.start,
              creatorId: apiKeyDB.referenceId,
              creatorName: userDB.name,
              creatorEmail: userDB.email,
              enabled: apiKeyDB.enabled,
              createdAt: apiKeyDB.createdAt,
              expiresAt: apiKeyDB.expiresAt,
              lastRequest: apiKeyDB.lastRequest,
              requestCount: apiKeyDB.requestCount,
            })
            .from(apiKeyDB)
            .leftJoin(userDB, eq(userDB.id, apiKeyDB.referenceId))
            .where(filters.length > 0 ? and(...filters) : undefined)
            .$dynamic();
        },
        orderBy: [desc(apiKeyDB.createdAt), desc(apiKeyDB.id)],
        page,
        pageSize,
        mapRow: (row) => {
          if (!row.createdAt) throw new Error("API key creation timestamp is missing");

          return {
            id: row.id,
            name: row.name,
            prefix: row.prefix,
            start: row.start,
            creator: {
              id: row.creatorId,
              name: row.creatorName,
              email: row.creatorEmail,
            },
            status: row.enabled ? "active" : "revoked",
            createdAt: row.createdAt,
            expiresAt: row.expiresAt,
            lastRequest: row.lastRequest,
            requestCount: row.requestCount,
          };
        },
      });
    },
    async create(input, requestHeaders) {
      const apiKey = await fastify.auth.api.createApiKey({
        headers: requestHeaders,
        body: {
          name: input.name,
          expiresIn: input.expiresInSeconds ?? null,
        },
      });

      return {
        id: apiKey.id,
        name: apiKey.name ?? null,
        prefix: apiKey.prefix ?? null,
        start: apiKey.start ?? null,
        key: apiKey.key,
        expiresAt: formatDateToISOString(apiKey.expiresAt),
      };
    },
    async revoke(apiKeyId) {
      const [updated] = await fastify.db
        .update(apiKeyDB)
        .set({ enabled: false })
        .where(eq(apiKeyDB.id, apiKeyId))
        .returning({ id: apiKeyDB.id });

      if (!updated) {
        throw notFound("apiKey.notFound", "The API key was not found");
      }
    },
  };
}
