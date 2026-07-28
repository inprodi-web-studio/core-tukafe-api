import type { PaginatedResult } from "@core/utils";

export type CustomerSortField =
  | "name"
  | "phone"
  | "email"
  | "orderCount"
  | "lastOrderAt"
  | "createdAt";
export type CustomerSortDirection = "asc" | "desc";

export interface CustomerListItem {
  id: string;
  name: string | null;
  middleName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  cashbackBalanceCents: number;
  orderCount: number;
  lastOrderAt: Date | null;
  createdAt: Date;
}

export interface CustomerListParams {
  page: number;
  pageSize: number;
  search?: string | null;
  sortBy: CustomerSortField;
  sortDirection: CustomerSortDirection;
}

export interface AdminCustomersService {
  list(input: CustomerListParams): Promise<PaginatedResult<CustomerListItem>>;
}
