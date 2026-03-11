import type { Supplier } from "@core/db/schemas";
import type { GetServiceConfig, ListQueryParams } from "@core/types";
import type { PaginatedResult } from "@core/utils";

export interface AdminSuppliersService {
  get(id: string, config?: GetServiceConfig): Promise<SupplierResponse | null>;
  list(input?: ListQueryParams): Promise<PaginatedResult<SupplierResponse>>;
  create(input: CreateSupplierServiceParams): Promise<SupplierResponse>;
}

export interface CreateSupplierServiceParams {
  name: string;
  email?: string | null;
  phone?: string | null;
}

export type SupplierResponse = Pick<Supplier, "id" | "name" | "email" | "phone">;
