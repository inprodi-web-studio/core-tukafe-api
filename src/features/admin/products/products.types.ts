import type { Product, ProductCategory, ProductType, Tax, Unit } from "@core/db/schemas";
import type { GetServiceConfig } from "@core/types";

export interface AdminProductsService {
  get(id: string, config?: GetServiceConfig): Promise<ProductResponse | null>;
  create(input: CreateProductServiceParams): Promise<ProductResponse>;
}

export interface ProductResponse extends Omit<Product, "categoryId" | "unitId"> {
  unit: Unit;
  category: ProductCategory | null;
  taxes: Array<Tax>;
}

export interface ProductWithTaxRelations extends Omit<ProductResponse, "taxes"> {
  taxes: Array<{
    tax: Tax;
  }>;
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
}
