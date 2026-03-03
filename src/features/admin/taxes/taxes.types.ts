import type { Tax } from "@core/db/schemas";
import type { ListQueryParams } from "@core/types";
import type { PaginatedResult } from "@core/utils";

export interface AdminTaxesService {
  list(input?: ListQueryParams): Promise<PaginatedResult<Tax>>;
  create(input: CreateTaxServiceParams): Promise<Tax>;
}

export interface CreateTaxServiceParams {
  name: string;
  rate: number;
}
