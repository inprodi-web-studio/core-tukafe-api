import type {
  Ingredient,
  IngredientCategory,
  Modifier,
  ModifierOption,
  ModifierOptionIngredient,
  ModifierOptionSupply,
  Supply,
  SupplyCategory,
  Unit,
} from "@core/db/schemas";
import type { GetServiceConfig, ListQueryParams } from "@core/types";
import type { PaginatedResult } from "@core/utils";

export interface AdminModifiersService {
  get(id: string, config?: GetServiceConfig): Promise<ModifierResponse | null>;
  list(input?: ListModifiersParams): Promise<PaginatedResult<ModifierResponse>>;
  create(input: CreateModifierServiceParams): Promise<ModifierResponse>;
}

export type ListModifiersParams = ListQueryParams;

export interface CreateModifierServiceParams {
  name: string;
  kitchenName?: string | null;
  customerLabel?: string | null;
  multiSelect?: boolean | null;
  minSelect?: number | null;
  maxSelect?: number | null;
  options: CreateModifierOptionParams[];
}

export interface CreateModifierOptionParams {
  name: string;
  kitchenName?: string | null;
  customerName?: string | null;
  price?: number | null;
  isDefault?: boolean | null;
  ingredients?: CreateModifierOptionIngredientParams[];
  supplies?: CreateModifierOptionSupplyParams[];
}

export interface CreateModifierOptionIngredientParams {
  ingredientId: string;
  quantity: number;
}

export interface CreateModifierOptionSupplyParams {
  supplyId: string;
  quantity: number;
}

export interface ModifierOptionIngredientItem extends Omit<Ingredient, "baseUnitId" | "categoryId"> {
  baseUnit: Unit;
  category: IngredientCategory;
}

export interface ModifierOptionSupplyItem extends Omit<Supply, "baseUnitId" | "categoryId"> {
  baseUnit: Unit;
  category: SupplyCategory;
}

export interface ModifierOptionIngredientResponse
  extends Omit<ModifierOptionIngredient, "modifierOptionId" | "ingredientId"> {
  ingredient: ModifierOptionIngredientItem;
}

export interface ModifierOptionSupplyResponse
  extends Omit<ModifierOptionSupply, "modifierOptionId" | "supplyId"> {
  supply: ModifierOptionSupplyItem;
}

export interface ModifierOptionResponse extends Omit<ModifierOption, "modifierId"> {
  ingredients: ModifierOptionIngredientResponse[];
  supplies: ModifierOptionSupplyResponse[];
}

export interface ModifierResponse extends Modifier {
  options: ModifierOptionResponse[];
}
