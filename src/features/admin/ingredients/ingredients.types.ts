import type { Ingredient, IngredientCategory, Unit } from "@core/db/schemas";
import type { GetServiceConfig } from "@core/types";

export interface AdminIngredientsService {
  get(id: string, config?: GetServiceConfig): Promise<IngredientResponse | null>;
  create(input: CreateIngredientServiceParams): Promise<IngredientResponse>;
}

export interface CreateIngredientServiceParams {
  name: string;
  description?: string | null;
  unitId: string;
  categoryId: string;
  baseCost: number;
}

export interface IngredientResponse extends Omit<Ingredient, "categoryId" | "unitId"> {
  unit: Unit;
  category: IngredientCategory;
}
