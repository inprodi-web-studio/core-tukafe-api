import { isHttpError, unauthorized } from "@core/utils";
import type { FastifyReply, FastifyRequest } from "fastify";

type ApiKeyPermissions = Record<string, string[]>;

export interface ApiKeyAuthSession {
  id: string;
  userId: string;
  name: string | null;
  prefix: string | null;
  start: string | null;
  permissions: ApiKeyPermissions | null;
}

export interface ApiKeyAuthHandlerParams {
  headerName?: string;
  permissions?: ApiKeyPermissions;
}

declare module "fastify" {
  interface FastifyRequest {
    apiKeyAuth: ApiKeyAuthSession;
  }
}

function readApiKey(request: FastifyRequest, headerName: string): string | null {
  const headerValue = request.headers[headerName.toLowerCase()];

  if (Array.isArray(headerValue)) {
    const [firstValue] = headerValue;

    return firstValue?.trim() || null;
  }

  if (typeof headerValue === "string") {
    return headerValue.trim() || null;
  }

  return null;
}

function apiKeyAuthHandler({
  headerName = "x-api-key",
  permissions,
}: ApiKeyAuthHandlerParams = {}) {
  return async function apiKeyAuth(request: FastifyRequest, _reply: FastifyReply) {
    const apiKey = readApiKey(request, headerName);

    if (!apiKey) {
      throw unauthorized("apiKey.missing", "A valid API key is required");
    }

    try {
      const verification = await request.server.auth.api.verifyApiKey({
        body: {
          key: apiKey,
          permissions,
        },
      });

      if (!verification.valid || !verification.key) {
        throw unauthorized(
          "apiKey.invalid",
          verification.error?.message ?? "The provided API key is invalid",
        );
      }

      request.apiKeyAuth = {
        id: verification.key.id,
        userId: verification.key.userId,
        name: verification.key.name ?? null,
        prefix: verification.key.prefix ?? null,
        start: verification.key.start ?? null,
        permissions: (verification.key.permissions as ApiKeyPermissions | null) ?? null,
      };
    } catch (error) {
      if (isHttpError(error)) {
        throw error;
      }

      throw unauthorized("apiKey.unauthorized", "Failed to authenticate API key");
    }
  };
}

export default apiKeyAuthHandler;
