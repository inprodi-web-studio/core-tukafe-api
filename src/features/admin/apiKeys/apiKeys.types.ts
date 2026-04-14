import type { RequestHeaders } from "@core/types";

export interface AdminApiKeysService {
  create(
    input: CreateAdminApiKeyServiceParams,
    requestHeaders?: RequestHeaders,
  ): Promise<CreateAdminApiKeyServiceResponse>;
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
