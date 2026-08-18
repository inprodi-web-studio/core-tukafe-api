import type { Supply, SupplyCategory, Unit } from "@core/db/schemas";
import type { GetServiceConfig, ListQueryParams } from "@core/types";
import type { PaginatedResult } from "@core/utils";

export interface AdminSuppliesService {
  get(id: string, config?: GetServiceConfig): Promise<SupplyResponse | null>;
  list(input?: ListQueryParams): Promise<PaginatedResult<SupplyResponse>>;
  create(input: CreateSupplyServiceParams): Promise<SupplyResponse>;
  update(id: string, input: UpdateSupplyServiceParams): Promise<SupplyResponse>;
  remove(id: string): Promise<void>;
}

export type UpdateSupplyServiceParams = Partial<CreateSupplyServiceParams>;

export interface CreateSupplyServiceParams {
  name: string;
  description?: string | null;
  baseUnitId: string;
  categoryId: string;
  baseCostPerUnit: number;
  isInventoryTracked?: boolean;
  tracksLots?: boolean;
  isPerishable?: boolean;
  expirationWarningDays?: number;
}

export interface SupplyResponse extends Omit<Supply, "categoryId" | "baseUnitId"> {
  baseUnit: Unit;
  category: SupplyCategory;
}
