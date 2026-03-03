import type { Ingredient, IngredientCategory, Unit } from "@core/db/schemas";
import type { GetServiceConfig, ListQueryParams } from "@core/types";
import type { PaginatedResult } from "@core/utils";

export interface AdminIngredientsService {
  get(id: string, config?: GetServiceConfig): Promise<IngredientResponse | null>;
  list(input?: ListQueryParams): Promise<PaginatedResult<IngredientResponse>>;
  create(input: CreateIngredientServiceParams): Promise<IngredientResponse>;
}

export interface CreateIngredientServiceParams {
  name: string;
  description?: string | null;
  baseUnitId: string;
  categoryId: string;
  baseCostPerUnit: number;
}

export interface IngredientResponse extends Omit<Ingredient, "categoryId" | "baseUnitId"> {
  baseUnit: Unit;
  category: IngredientCategory;
}
