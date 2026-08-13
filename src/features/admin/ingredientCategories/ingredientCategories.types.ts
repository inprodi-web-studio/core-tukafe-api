import type { IngredientCategory } from "@core/db/schemas";
import type { GetServiceConfig, ListQueryParams } from "@core/types";
import type { PaginatedResult } from "@core/utils";

export interface AdminIngredientCategoriesService {
  /*
      get(id: string, config?: GetServiceConfig): Promise<ProductResponse | null>;
      create(input: CreateProductServiceParams): Promise<ProductResponse>;
    */
  get(id: string, config?: GetServiceConfig): Promise<IngredientCategory | null>;
  list(input?: ListQueryParams): Promise<PaginatedResult<IngredientCategory>>;
  create(input: CreateIngredientCategoryServiceParams): Promise<IngredientCategory>;
  update(id: string, input: UpdateIngredientCategoryServiceParams): Promise<IngredientCategory>;
  remove(id: string): Promise<void>;
}

export interface CreateIngredientCategoryServiceParams {
  name: string;
  icon?: string;
  color: string;
}

export type UpdateIngredientCategoryServiceParams = Partial<CreateIngredientCategoryServiceParams>;
