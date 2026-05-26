import type { Upload, VariationGroup, VariationGroupOption } from "@core/db/schemas";
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
  customerLabel?: string | null;
  options: CreateVariationGroupOptionParams[];
}

export interface CreateVariationGroupOptionParams {
  name: string;
  customerDescription?: string | null;
  imageUploadId?: string | null;
  sortOrder?: number | null;
}

export type VariationGroupOptionImage = Pick<
  Upload,
  "id" | "name" | "path" | "visibility" | "mimeType"
>;

export interface VariationGroupOptionResponse extends Omit<VariationGroupOption, "imageUploadId"> {
  image: VariationGroupOptionImage | null;
}

export interface VariationGroupResponse extends VariationGroup {
  options: VariationGroupOptionResponse[];
}
