import type {
  Coupon,
  CouponDiscountType,
  CouponPeriodLimitType,
  CouponRuleMode,
} from "@core/db/schemas";
import type { ListQueryParams } from "@core/types";
import type { PaginatedResult } from "@core/utils";

export interface CouponRuleSetInput {
  includeProductIds?: string[] | null;
  excludeProductIds?: string[] | null;
  includeCategoryIds?: string[] | null;
  excludeCategoryIds?: string[] | null;
}

export interface CreateCouponServiceParams {
  organizationId: string;
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
  code?: string | null;
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
  periodLimitType: CouponPeriodLimitType | null;
  periodLimitCount: number | null;
  maxRedemptionsPerCustomer: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminCouponsService {
  list(input?: ListQueryParams): Promise<PaginatedResult<CouponListItemResponse>>;
  create(input: CreateCouponServiceParams): Promise<CouponResponse>;
  getById(couponId: string): Promise<CouponResponse>;
  update(couponId: string, input: UpdateCouponServiceParams): Promise<CouponResponse>;
  updateStatus(couponId: string, input: UpdateCouponStatusServiceParams): Promise<CouponResponse>;
}

export type CouponRuleModeMapping = {
  mode: CouponRuleMode;
  productId?: string;
  categoryId?: string;
};
