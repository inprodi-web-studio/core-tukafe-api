import type { PaginatedResult } from "@core/utils";

export type CashbackMovementType = "earned" | "redeemed" | "adjustment_credit" | "adjustment_debit";
export type CashbackDirection = "credit" | "debit";
export type CashbackSource = "order" | "adjustment";
export type CashbackSortField = "createdAt" | "customer" | "amount" | "balanceAfter";
export type CashbackSortDirection = "asc" | "desc";

export interface AdminCashbackMovement {
  id: string;
  type: CashbackMovementType;
  direction: CashbackDirection;
  source: CashbackSource;
  amountCents: number;
  balanceAfterCents: number;
  createdAt: Date;
  customer: {
    id: string;
    name: string | null;
    middleName: string | null;
    lastName: string | null;
    phone: string | null;
    email: string | null;
  };
  organization: {
    id: string;
    name: string;
  } | null;
  order: {
    id: string;
    folio: string;
  } | null;
  adjustment: {
    reason: string;
    createdBy: {
      id: string;
      name: string;
      middleName: string | null;
      lastName: string | null;
      email: string;
    };
  } | null;
}

export interface CashbackListParams {
  page: number;
  pageSize: number;
  search?: string | null;
  direction?: CashbackDirection;
  source?: CashbackSource;
  sortBy: CashbackSortField;
  sortDirection: CashbackSortDirection;
}

export interface CreateCashbackAdjustmentParams {
  customerId: string;
  direction: CashbackDirection;
  amountCents: number;
  reason: string;
  createdByUserId: string;
}

export interface CashbackAdjustmentResult {
  id: string;
  customerId: string;
  direction: CashbackDirection;
  amountCents: number;
  balanceBeforeCents: number;
  balanceAfterCents: number;
  createdAt: Date;
}

export interface AdminCashbackService {
  list(input: CashbackListParams): Promise<PaginatedResult<AdminCashbackMovement>>;
  createAdjustment(input: CreateCashbackAdjustmentParams): Promise<CashbackAdjustmentResult>;
}
