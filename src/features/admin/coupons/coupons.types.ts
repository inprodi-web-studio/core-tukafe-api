import type {
  Coupon,
  CouponDiscountType,
  CouponPeriodLimitType,
  CouponRuleMode,
} from "@core/db/schemas";
import type { PaginatedResult } from "@core/utils";

export type CouponEffectiveStatus = "active" | "scheduled" | "expired" | "inactive";
export type CouponSortField =
  | "code"
  | "startsAt"
  | "endsAt"
  | "redemptions"
  | "discountAmount"
  | "updatedAt";
export type CouponSortDirection = "asc" | "desc";
export type CouponRuleResource = "product" | "category";

export interface CouponRuleSetInput {
  includeProductIds?: string[] | null;
  excludeProductIds?: string[] | null;
  includeCategoryIds?: string[] | null;
  excludeCategoryIds?: string[] | null;
}

export interface CreateCouponServiceParams {
  creatorUserId: string;
  organizationIds: string[];
  code: string;
  isActive?: boolean | null;
  startsAt: string;
  endsAt?: string | null;
  discountType: CouponDiscountType;
  discountValue: number;
  allowWithLoyaltyFreeDrink?: boolean | null;
  periodLimitType?: CouponPeriodLimitType | null;
  periodLimitCount?: number | null;
  maxRedemptionsPerCustomer?: number | null;
  minEligibleSubtotalCents?: number | null;
  maxDiscountCents?: number | null;
  rules?: CouponRuleSetInput | null;
}

export interface UpdateCouponServiceParams {
  organizationId: string;
  code?: string | null;
  isActive?: boolean | null;
  startsAt?: string | null;
  endsAt?: string | null;
  discountType?: CouponDiscountType | null;
  discountValue?: number | null;
  allowWithLoyaltyFreeDrink?: boolean | null;
  periodLimitType?: CouponPeriodLimitType | null;
  periodLimitCount?: number | null;
  maxRedemptionsPerCustomer?: number | null;
  minEligibleSubtotalCents?: number | null;
  maxDiscountCents?: number | null;
  rules?: CouponRuleSetInput | null;
}

export interface UpdateCouponStatusServiceParams {
  isActive: boolean;
}

export interface CouponRuleSetResponse {
  includeProductIds: string[];
  excludeProductIds: string[];
  includeCategoryIds: string[];
  excludeCategoryIds: string[];
}

export interface CouponResponse extends Coupon {
  rules: CouponRuleSetResponse;
}

export interface CouponListItemResponse {
  id: string;
  organizationId: string;
  code: string;
  isActive: boolean;
  startsAt: Date;
  endsAt: Date | null;
  discountType: CouponDiscountType;
  discountValue: number;
  effectiveStatus: CouponEffectiveStatus;
  allowWithLoyaltyFreeDrink: boolean;
  periodLimitType: CouponPeriodLimitType | null;
  periodLimitCount: number | null;
  maxRedemptionsPerCustomer: number | null;
  minEligibleSubtotalCents: number | null;
  maxDiscountCents: number | null;
  redemptionCount: number;
  totalDiscountCents: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CouponListParams {
  organizationId: string;
  page: number;
  pageSize: number;
  search?: string | null;
  status?: CouponEffectiveStatus;
  discountType?: CouponDiscountType;
  sortBy: CouponSortField;
  sortDirection: CouponSortDirection;
}

export interface CouponRuleOption {
  id: string;
  label: string;
  description: string | null;
}

export interface CouponRuleOptionsParams {
  resource: CouponRuleResource;
  page: number;
  pageSize: number;
  search?: string | null;
  ids?: string[];
}

export interface AdminCouponsService {
  list(input: CouponListParams): Promise<PaginatedResult<CouponListItemResponse>>;
  create(input: CreateCouponServiceParams): Promise<{ data: CouponResponse[] }>;
  getById(couponId: string, organizationId: string): Promise<CouponResponse>;
  update(couponId: string, input: UpdateCouponServiceParams): Promise<CouponResponse>;
  updateStatus(
    couponId: string,
    organizationId: string,
    input: UpdateCouponStatusServiceParams,
  ): Promise<CouponResponse>;
  listRuleOptions(input: CouponRuleOptionsParams): Promise<PaginatedResult<CouponRuleOption>>;
}

export type CouponRuleModeMapping = {
  mode: CouponRuleMode;
  productId?: string;
  categoryId?: string;
};
