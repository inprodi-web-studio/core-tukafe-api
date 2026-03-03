import type {
  Ingredient,
  IngredientCategory,
  Product,
  ProductCategory,
  ProductType,
  Recipe,
  RecipeIngredient,
  RecipeSupply,
  Supply,
  SupplyCategory,
  Tax,
  Unit,
} from "@core/db/schemas";
import type { GetServiceConfig } from "@core/types";

export interface AdminProductsService {
  get(id: string, config?: GetServiceConfig): Promise<ProductResponse | null>;
  create(input: CreateProductServiceParams): Promise<ProductResponse>;
}

export interface ProductResponse extends Omit<Product, "categoryId" | "unitId"> {
  unit: Unit;
  category: ProductCategory | null;
  taxes: Array<Tax>;
  recipe: ProductRecipeResponse | null;
}

export interface ProductWithRelations extends Omit<ProductResponse, "taxes" | "recipe"> {
  taxes: Array<{
    tax: Tax;
  }>;
  recipe: ProductRecipeWithRelations | null;
}

export interface CreateProductServiceParams {
  name: string;
  kitchenName?: string | null;
  price: number;
  customerDescription?: string | null;
  kitchenDescription?: string | null;
  unitId: string;
  categoryId?: string | null;
  productType: ProductType;
  taxIds?: string[] | null;
  recipe?: CreateProductRecipeParams;
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

export interface CreateProductRecipeIngredientParams {
  ingredientId: string;
  quantity: number;
}

export interface CreateProductRecipeSupplyParams {
  supplyId: string;
  quantity: number;
}

export interface ProductRecipeResponse extends Omit<Recipe, "productId"> {
  ingredients: ProductRecipeIngredientResponse[];
  supplies: ProductRecipeSupplyResponse[];
}

export interface ProductRecipeIngredientResponse
  extends Omit<RecipeIngredient, "recipeId" | "ingredientId"> {
  ingredient: ProductRecipeIngredientItem;
}

export interface ProductRecipeSupplyResponse extends Omit<RecipeSupply, "recipeId" | "supplyId"> {
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

export interface ProductRecipeWithRelations extends Omit<ProductRecipeResponse, "ingredients" | "supplies"> {
  ingredients: Array<{
    quantity: number;
    createdAt: Date | null;
    updatedAt: Date | null;
    ingredient: ProductRecipeIngredientItem;
  }>;
  supplies: Array<{
    quantity: number;
    createdAt: Date | null;
    updatedAt: Date | null;
    supply: ProductRecipeSupplyItem;
  }>;
}
