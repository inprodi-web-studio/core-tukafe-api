import type { SupplyCategory } from "@core/db/schemas";
import type { GetServiceConfig, ListQueryParams } from "@core/types";
import type { PaginatedResult } from "@core/utils";

export interface AdminSupplyCategoriesService {
  get(id: string, config?: GetServiceConfig): Promise<SupplyCategory | null>;
  list(input?: ListQueryParams): Promise<PaginatedResult<SupplyCategory>>;
  create(input: CreateSupplyCategoryServiceParams): Promise<SupplyCategory>;
}

export interface CreateSupplyCategoryServiceParams {
  name: string;
  icon: string;
  color: string;
}
