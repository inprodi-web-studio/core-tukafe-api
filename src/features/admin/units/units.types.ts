import type { Unit } from "@core/db/schemas";
import type { GetServiceConfig, ListQueryParams } from "@core/types";
import type { PaginatedResult } from "@core/utils";

export interface AdminUnitsService {
  get(id: string, config?: GetServiceConfig): Promise<Unit | null>;
  list(input?: ListQueryParams): Promise<PaginatedResult<UnitListItem>>;
  create(input: CreateUnitServiceParams): Promise<UnitListItem>;
}

export interface CreateUnitServiceParams {
  name: string;
  abbreviation: string;
  precision: number;
}

export interface UnitListItem {
  id: string;
  name: string;
  abbreviation: string;
  precision: number;
}
