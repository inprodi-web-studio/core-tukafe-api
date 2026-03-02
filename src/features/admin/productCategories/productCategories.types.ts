import type { PaginatedResult } from "@core/utils";
import type { ProductCategory } from "@core/db/schemas";
import type { GetServiceConfig } from "@core/types";

export interface ProductCategoryListItem {
  id: string;
  name: string;
  icon: string;
  color: string;
  children: ProductCategoryListItem[];
}

export interface AdminProductcategoriesService {
  get(id: string, config?: GetServiceConfig): Promise<ProductCategory | null>;
  list(
    input?: ListProductCategoriesServiceParams,
  ): Promise<PaginatedResult<ProductCategoryListItem>>;
  create(input: CreateProductCategoryServiceParams): Promise<ProductCategory>;
}

export interface CreateProductCategoryServiceParams {
  name: string;
  icon: string;
  color: string;
  parentId?: string | null;
}

export interface ListProductCategoriesServiceParams {
  page?: number;
  pageSize?: number;
  search?: string | null;
}
