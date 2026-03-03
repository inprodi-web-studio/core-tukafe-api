import type { Supply, SupplyCategory, Unit } from "@core/db/schemas";
import type { GetServiceConfig, ListQueryParams } from "@core/types";
import type { PaginatedResult } from "@core/utils";

export interface AdminSuppliesService {
  get(id: string, config?: GetServiceConfig): Promise<SupplyResponse | null>;
  list(input?: ListQueryParams): Promise<PaginatedResult<SupplyResponse>>;
  create(input: CreateSupplyServiceParams): Promise<SupplyResponse>;
}

export interface CreateSupplyServiceParams {
  name: string;
  description?: string | null;
  baseUnitId: string;
  categoryId: string;
  baseCostPerUnit: number;
}

export interface SupplyResponse extends Omit<Supply, "categoryId" | "baseUnitId"> {
  baseUnit: Unit;
  category: SupplyCategory;
}
