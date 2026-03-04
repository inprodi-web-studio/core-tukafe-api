import type { VariationGroup, VariationGroupOption } from "@core/db/schemas";
import type { GetServiceConfig, ListQueryParams } from "@core/types";
import type { PaginatedResult } from "@core/utils";

export interface AdminVariationGroupsService {
  get(id: string, config?: GetServiceConfig): Promise<VariationGroupResponse | null>;
  list(input?: ListVariationGroupsParams): Promise<PaginatedResult<VariationGroupResponse>>;
  create(input: CreateVariationGroupServiceParams): Promise<VariationGroupResponse>;
}

export type ListVariationGroupsParams = ListQueryParams;

export interface CreateVariationGroupServiceParams {
  name: string;
  options: CreateVariationGroupOptionParams[];
}

export interface CreateVariationGroupOptionParams {
  name: string;
  sortOrder?: number | null;
}

export interface VariationGroupResponse extends VariationGroup {
  options: VariationGroupOption[];
}
