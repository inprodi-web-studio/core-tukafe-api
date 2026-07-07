import type {
  Ingredient,
  IngredientCategory,
  Organization,
  OrganizationProduct,
  Product,
  ProductCompoundComponent,
  ProductCategory,
  ProductModifier,
  ProductModifierOption,
  ProductModifierVisibilityRule,
  ProductType,
  ProductVariationGroup,
  Supply,
  SupplyCategory,
  Tax,
  Unit,
  Upload,
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
  assignOrganization(productId: string, organizationId: string): Promise<ProductResponse>;
  unassignOrganization(productId: string, organizationId: string): Promise<ProductResponse>;
  createVariation(productId: string, input: CreateProductVariationParams): Promise<ProductResponse>;
  createModifier(productId: string, input: CreateProductModifierParams): Promise<ProductResponse>;
  updateModifierOptions(
    productId: string,
    modifierId: string,
    input: UpdateProductModifierOptionsParams,
  ): Promise<ProductResponse>;
}

export interface ProductCategoryResponse extends Omit<ProductCategory, "imageUploadId"> {
  image: Pick<Upload, "id" | "name" | "path" | "visibility" | "mimeType"> | null;
}

export type ProductImageResponse = Pick<Upload, "id" | "name" | "path" | "visibility" | "mimeType">;

export interface ProductResponse extends Omit<Product, "categoryId" | "unitId" | "imageUploadId"> {
  unit: Unit;
  category: ProductCategoryResponse | null;
  categories: ProductCategoryResponse[];
  image: ProductImageResponse | null;
  taxes: Array<Tax>;
  organizations: ProductOrganizationResponse[];
  modifiers: ProductModifierResponse[];
  recipe: RecipeDetailsResponse | null;
  variationGroups: ProductVariationGroupResponse[];
  variations: ProductVariationResponse[];
  compoundComponents: ProductCompoundComponentResponse[];
}

export interface ProductWithRelations extends Omit<
  ProductResponse,
  "taxes" | "variationGroups" | "modifiers" | "organizations" | "categories" | "compoundComponents"
> {
  taxes: Array<{
    tax: Tax;
  }>;
  categories: ProductCategoryLinkWithRelations[];
  organizations: ProductOrganizationLinkWithRelations[];
  variationGroups: ProductVariationGroupLinkWithRelations[];
  modifiers: ProductModifierLinkWithRelations[];
  compoundComponents: ProductCompoundComponentWithRelations[];
}

export interface CreateProductServiceParams {
  name: string;
  kitchenName?: string | null;
  price?: number | null;
  customerDescription?: string | null;
  kitchenDescription?: string | null;
  unitId: string;
  categoryId?: string | null;
  categoryIds?: string[] | null;
  imageUploadId?: string | null;
  isFeatured?: boolean;
  productType: ProductType;
  taxIds?: string[] | null;
  organizationIds?: string[] | null;
  modifierIds?: string[] | null;
  modifiers?: string[] | null;
  modifierConfigs?: CreateProductModifierParams[] | null;
  recipe?: CreateProductRecipeParams;
  variationGroupIds?: string[] | null;
  variations?: CreateProductVariationParams[] | null;
  compoundComponents?: CreateProductCompoundComponentParams[] | null;
}

export interface CreateProductCompoundComponentParams {
  productId: string;
  quantity?: number | null;
  sortOrder?: number | null;
  label?: string | null;
}

export interface NormalizedProductCompoundComponentParams {
  productId: string;
  quantity: number;
  sortOrder: number;
  label: string | null;
}

export interface ValidatedProductCompoundComponent {
  componentProductId: string;
  quantity: number;
  sortOrder: number;
  label: string | null;
}

export interface CreateProductModifierParams {
  modifierId: string;
  optionIds?: string[] | null;
  visibleWhen?: ProductModifierVisibilityConditionParams[] | null;
}

export interface NormalizedProductModifierParams {
  modifierId: string;
  optionIds: string[] | null;
  visibleWhen: ProductModifierVisibilityConditionParams[];
}

export interface UpdateProductModifierOptionsParams {
  optionIds: string[] | null;
  visibleWhen?: ProductModifierVisibilityConditionParams[] | null;
}

export interface ValidatedProductModifierConfig {
  modifierId: string;
  optionIds: string[] | null;
  visibleWhen: ProductModifierVisibilityConditionParams[];
}

export type ProductModifierVisibilityConditionParams = Pick<
  ProductModifierVisibilityRule,
  "variationGroupId" | "variationOptionId"
>;

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
  options: ProductVariationGroupOptionResponse[];
}

export interface ProductVariationGroupOptionResponse extends Omit<
  VariationGroupOption,
  "imageUploadId"
> {
  image: ProductImageResponse | null;
}

export interface ProductCategoryLinkWithRelations {
  category: ProductCategoryResponse;
}

export interface ProductVariationGroupLinkWithRelations extends ProductVariationGroup {
  group: ProductVariationGroupResponse;
}

export interface ProductModifierLinkWithRelations extends ProductModifier {
  modifier: ModifierResponse;
  allowedOptions: Array<Pick<ProductModifierOption, "modifierOptionId">>;
  visibilityRules: ProductModifierVisibilityConditionParams[];
}

export interface ProductCompoundComponentWithRelations extends ProductCompoundComponent {
  componentProduct: Pick<
    Product,
    "id" | "name" | "kitchenName" | "priceCents" | "productType" | "customerDescription"
  > & {
    image: ProductImageResponse | null;
  };
}

export interface ProductCompoundComponentResponse extends Omit<
  ProductCompoundComponent,
  "compoundProductId" | "componentProductId"
> {
  product: ProductCompoundComponentWithRelations["componentProduct"];
}

export interface ProductOrganizationLinkWithRelations extends OrganizationProduct {
  organization: Organization;
}

export type ProductOrganizationResponse = Pick<
  Organization,
  "id" | "name" | "slug" | "address" | "latitude" | "longitude" | "logo"
>;

export type ProductModifierResponse = ModifierResponse & {
  optionScope: "all" | "subset";
  allowedOptionIds: string[] | null;
  visibleWhen: ProductModifierVisibilityConditionParams[];
};

export interface ProductVariationResponse extends Omit<Variation, "productId" | "combinationKey"> {
  selections: ProductVariationSelectionResponse[];
  recipe: RecipeDetailsResponse | null;
}

export interface ProductVariationSelectionResponse extends Omit<
  VariationSelection,
  "variationId" | "variationGroupId" | "variationOptionId"
> {
  group: VariationGroup;
  option: ProductVariationGroupOptionResponse;
}
