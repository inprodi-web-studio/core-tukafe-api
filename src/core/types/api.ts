import type { listQueryParamsSchema } from "@core/utils";
import type { z } from "zod";

export type RequestHeaders = Record<string, string | string[] | undefined>;

export interface BetterAuthError {
  status: string;
  body: {
    code: string;
    message: string;
  };
  statusCode: number;
}

export interface GetServiceConfig {
  safe?: boolean;
}

export type ListQueryParams = z.infer<typeof listQueryParamsSchema>;

export interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}
