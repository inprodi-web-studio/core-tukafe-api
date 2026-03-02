import type { ListQueryParams } from "@core/types";
import type { PaginatedResult } from "@core/utils";

export interface AdminTaxesService {
  list(input?: ListQueryParams): Promise<PaginatedResult<TaxListItem>>;
  create(input: CreateTaxServiceParams): Promise<TaxListItem>;
}

export interface CreateTaxServiceParams {
  name: string;
  rate: number;
}

export interface TaxListItem {
  id: string;
  name: string;
  rate: number;
  createdAt: Date;
  updatedAt: Date;
}
