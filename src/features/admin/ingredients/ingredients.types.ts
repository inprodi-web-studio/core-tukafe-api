import type { Ingredient, IngredientCategory, Unit } from "@core/db/schemas";
import type { GetServiceConfig } from "@core/types";

export interface AdminIngredientsService {
  get(id: string, config?: GetServiceConfig): Promise<IngredientResponse | null>;
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
