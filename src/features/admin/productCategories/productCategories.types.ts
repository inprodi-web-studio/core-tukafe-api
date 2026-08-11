import type { ProductCategory, Upload } from "@core/db/schemas";
import type { GetServiceConfig } from "@core/types";
import type { PaginatedResult } from "@core/utils";

export type ProductCategoryImage = Pick<Upload, "id" | "name" | "path" | "visibility" | "mimeType">;

export interface ProductCategoryListItem {
  id: string;
  parentId: string | null;
  name: string;
  icon: string;
  color: string;
  sortOrder: number;
  isFourPlusOneEligible: boolean;
  isCashbackEligible: boolean;
  image: ProductCategoryImage | null;
  children: ProductCategoryListItem[];
}

export interface ProductCategoryResponse extends Omit<ProductCategory, "imageUploadId"> {
  image: ProductCategoryImage | null;
}

export interface AdminProductCategoriesService {
  get(id: string, config?: GetServiceConfig): Promise<ProductCategoryResponse | null>;
  list(
    input?: ListProductCategoriesServiceParams,
  ): Promise<PaginatedResult<ProductCategoryListItem>>;
  create(input: CreateProductCategoryServiceParams): Promise<ProductCategoryResponse>;
  update(id: string, input: UpdateProductCategoryServiceParams): Promise<ProductCategoryResponse>;
  reorder(id: string, direction: ProductCategoryOrderDirection): Promise<void>;
  remove(id: string): Promise<void>;
}

export type ProductCategoryOrderDirection = "up" | "down";

export interface CreateProductCategoryServiceParams {
  name: string;
  icon?: string;
  color: string;
  sortOrder?: number;
  isFourPlusOneEligible?: boolean;
  isCashbackEligible?: boolean;
  imageUploadId: string;
  parentId?: string | null;
}

export interface UpdateProductCategoryServiceParams {
  name?: string;
  icon?: string;
  color?: string;
  sortOrder?: number;
  isFourPlusOneEligible?: boolean;
  isCashbackEligible?: boolean;
  imageUploadId?: string;
  parentId?: string | null;
}

export interface ListProductCategoriesServiceParams {
  page?: number;
  pageSize?: number;
  search?: string | null;
}
