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
  };
}
