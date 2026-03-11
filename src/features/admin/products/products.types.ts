import type {
  Ingredient,
  IngredientCategory,
  Product,
  ProductCategory,
  ProductModifier,
  ProductType,
  ProductVariationGroup,
  Supply,
  SupplyCategory,
  Tax,
  Unit,
  Variation,
  VariationGroup,
  VariationGroupOption,
  VariationSelection,
} from "@core/db/schemas";
import type { GetServiceConfig, ListQueryParams } from "@core/types";
import type { PaginatedResult } from "@core/utils";
import type { ModifierResponse } from "../modifiers/modifiers.types";

export interface AdminProductsService {
  get(id: string, config?: GetServiceConfig): Promise<ProductResponse | null>;
  list(input?: ListQueryParams): Promise<PaginatedResult<ProductResponse>>;
  create(input: CreateProductServiceParams): Promise<ProductResponse>;
  createVariation(
    productId: string,
    input: CreateProductVariationParams,
  ): Promise<ProductResponse>;
  createModifier(
    productId: string,
    input: CreateProductModifierParams,
  ): Promise<ProductResponse>;
}

export interface ProductResponse extends Omit<Product, "categoryId" | "unitId"> {
  unit: Unit;
  category: ProductCategory | null;
  taxes: Array<Tax>;
  modifiers: ProductModifierResponse[];
  recipe: RecipeDetailsResponse | null;
  variationGroups: ProductVariationGroupResponse[];
  variations: ProductVariationResponse[];
}

export interface ProductWithRelations
  extends Omit<ProductResponse, "taxes" | "variationGroups" | "modifiers"> {
  taxes: Array<{
    tax: Tax;
  }>;
  variationGroups: ProductVariationGroupLinkWithRelations[];
  modifiers: ProductModifierLinkWithRelations[];
}

export interface CreateProductServiceParams {
  name: string;
  kitchenName?: string | null;
  price?: number | null;
  customerDescription?: string | null;
  kitchenDescription?: string | null;
  unitId: string;
  categoryId?: string | null;
  productType: ProductType;
  taxIds?: string[] | null;
  modifierIds?: string[] | null;
  modifiers?: string[] | null;
  recipe?: CreateProductRecipeParams;
  variationGroupIds?: string[] | null;
  variations?: CreateProductVariationParams[] | null;
}

export interface CreateProductModifierParams {
  modifierId: string;
}

export interface CreateProductRecipeParams {
  description?: string | null;
  ingredients?: CreateProductRecipeIngredientParams[];
  supplies?: CreateProductRecipeSupplyParams[];
}

export interface ValidatedProductRecipe {
  description: string | null;
  ingredients: CreateProductRecipeIngredientParams[];
  supplies: CreateProductRecipeSupplyParams[];
}

export interface CreateProductVariationParams {
  price: number;
  kitchenName?: string | null;
  customerDescription?: string | null;
  kitchenDescription?: string | null;
  selections: CreateProductVariationSelectionParams[];
  recipe?: CreateProductRecipeParams;
}

export interface NormalizedProductVariationParams extends Omit<
  CreateProductVariationParams,
  "price"
> {
  priceCents: number;
}

export interface CreateProductVariationSelectionParams {
  variationGroupId: string;
  variationOptionId: string;
}

export interface ValidatedProductVariation {
  priceCents: number;
  kitchenName: string | null;
  customerDescription: string | null;
  kitchenDescription: string | null;
  selections: ValidatedProductVariationSelection[];
  recipe: ValidatedProductRecipe | null;
  combinationKey: string;
}

export interface ValidatedProductVariationSelection {
  variationGroupId: string;
  variationOptionId: string;
}

export interface ValidatedProductVariationConfig {
  variationGroups: ProductVariationGroupResponse[];
  variations: ValidatedProductVariation[];
}

export interface CreateProductRecipeIngredientParams {
  ingredientId: string;
  quantity: number;
}

export interface CreateProductRecipeSupplyParams {
  supplyId: string;
  quantity: number;
}

export interface RecipeDetailsResponse {
  description: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  ingredients: ProductRecipeIngredientResponse[];
  supplies: ProductRecipeSupplyResponse[];
}

export interface ProductRecipeIngredientResponse {
  quantity: number;
  createdAt: Date | null;
  updatedAt: Date | null;
  ingredient: ProductRecipeIngredientItem;
}

export interface ProductRecipeSupplyResponse {
  quantity: number;
  createdAt: Date | null;
  updatedAt: Date | null;
  supply: ProductRecipeSupplyItem;
}

export interface ProductRecipeIngredientItem extends Omit<Ingredient, "baseUnitId" | "categoryId"> {
  baseUnit: Unit;
  category: IngredientCategory;
}

export interface ProductRecipeSupplyItem extends Omit<Supply, "baseUnitId" | "categoryId"> {
  baseUnit: Unit;
  category: SupplyCategory;
}

export interface ProductVariationGroupResponse extends VariationGroup {
  options: VariationGroupOption[];
}

export interface ProductVariationGroupLinkWithRelations extends ProductVariationGroup {
  group: ProductVariationGroupResponse;
}

export interface ProductModifierLinkWithRelations extends ProductModifier {
  modifier: ProductModifierResponse;
}

export type ProductModifierResponse = ModifierResponse;

export interface ProductVariationResponse extends Omit<Variation, "productId" | "combinationKey"> {
  selections: ProductVariationSelectionResponse[];
  recipe: RecipeDetailsResponse | null;
}

export interface ProductVariationSelectionResponse extends Omit<
  VariationSelection,
  "variationId" | "variationGroupId" | "variationOptionId"
> {
  group: VariationGroup;
  option: VariationGroupOption;
}
