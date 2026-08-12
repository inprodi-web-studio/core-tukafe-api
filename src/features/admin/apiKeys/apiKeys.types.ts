import type { RequestHeaders } from "@core/types";
import type { PaginatedResult } from "@core/utils";

export type ApiKeyStatus = "active" | "revoked";

export interface ApiKeyCreator {
  id: string | null;
  name: string | null;
  email: string | null;
}

export interface AdminApiKeyListItem {
  id: string;
  name: string | null;
  prefix: string | null;
  start: string | null;
  creator: ApiKeyCreator;
  status: ApiKeyStatus;
  createdAt: Date;
  expiresAt: Date | null;
  lastRequest: Date | null;
  requestCount: number;
}

export interface ListAdminApiKeysParams {
  page: number;
  pageSize: number;
  search?: string | null;
  status: "all" | ApiKeyStatus;
}

export interface AdminApiKeysService {
  list(input: ListAdminApiKeysParams): Promise<PaginatedResult<AdminApiKeyListItem>>;
  create(
    input: CreateAdminApiKeyServiceParams,
    requestHeaders?: RequestHeaders,
  ): Promise<CreateAdminApiKeyServiceResponse>;
  revoke(apiKeyId: string): Promise<void>;
}

export interface CreateAdminApiKeyServiceParams {
  name: string;
  expiresInSeconds?: number;
}

export interface CreateAdminApiKeyServiceResponse {
  id: string;
  name: string | null;
  prefix: string | null;
  start: string | null;
  key: string;
  expiresAt: string | null;
}
