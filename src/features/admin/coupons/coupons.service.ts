import {
  couponCategoryRulesDB,
  couponProductRulesDB,
  couponsDB,
  productCategoriesDB,
  productsDB,
  type Coupon,
  type CouponDiscountType,
  type CouponPeriodLimitType,
  type CouponRuleMode,
} from "@core/db/schemas";
import {
  buildFuzzySearch,
  conflict,
  generateNanoId,
  getPgError,
  notFound,
  paginate,
  validation,
} from "@core/utils";
import { asc, eq, inArray, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  mapCouponRulesResponse,
  normalizeCreateCouponInput,
  normalizeUpdateCouponInput,
} from "./coupons.helpers";
import type {
  AdminCouponsService,
  CouponListItemResponse,
  CouponResponse,
  CouponRuleSetResponse,
} from "./coupons.types";

const COUPON_ORG_CODE_UNIQUE_CONSTRAINT = "coupon_org_normalized_code_unique";
type TransactionDb = Parameters<Parameters<FastifyInstance["db"]["transaction"]>[0]>[0];

async function assertOrganizationExists(fastify: FastifyInstance, organizationId: string) {
  const organization = await fastify.db.query.organizationDB.findFirst({
    where(table, { and, eq, isNull }) {
      return and(eq(table.id, organizationId), isNull(table.deletedAt));
    },
    columns: {
      id: true,
    },
  });

  if (!organization) {
    throw notFound("organization.notFound", "The organization was not found");
  }
}

async function assertRuleReferencesExist(
  fastify: FastifyInstance,
  rules: CouponRuleSetResponse,
): Promise<void> {
  const uniqueProductIds = [...new Set([...rules.includeProductIds, ...rules.excludeProductIds])];
  const uniqueCategoryIds = [...new Set([...rules.includeCategoryIds, ...rules.excludeCategoryIds])];

  const [products, categories] = await Promise.all([
    uniqueProductIds.length > 0
      ? fastify.db
          .select({ id: productsDB.id })
          .from(productsDB)
          .where(inArray(productsDB.id, uniqueProductIds))
      : Promise.resolve([]),
    uniqueCategoryIds.length > 0
      ? fastify.db
          .select({ id: productCategoriesDB.id })
          .from(productCategoriesDB)
          .where(inArray(productCategoriesDB.id, uniqueCategoryIds))
      : Promise.resolve([]),
  ]);

  if (products.length !== uniqueProductIds.length) {
    throw notFound("coupon.rule.productNotFound", "One or more rule products were not found");
  }

  if (categories.length !== uniqueCategoryIds.length) {
    throw notFound("coupon.rule.categoryNotFound", "One or more rule categories were not found");
  }
}

async function loadCouponWithRules(
  fastify: FastifyInstance,
  couponId: string,
): Promise<CouponResponse | null> {
  const coupon = await fastify.db.query.couponsDB.findFirst({
    where(table, { eq: eqOperator }) {
      return eqOperator(table.id, couponId);
    },
    with: {
      productRules: true,
      categoryRules: true,
    },
  });

  if (!coupon) {
    return null;
  }

  const rules = mapCouponRulesResponse({
    productRules: coupon.productRules,
    categoryRules: coupon.categoryRules,
  });

  return {
    ...coupon,
    rules,
  };
}

async function replaceCouponRules({
  tx,
  couponId,
  rules,
}: {
  tx: Pick<TransactionDb, "insert" | "delete">;
  couponId: string;
  rules: CouponRuleSetResponse;
}) {
  await tx.delete(couponProductRulesDB).where(eq(couponProductRulesDB.couponId, couponId));
  await tx.delete(couponCategoryRulesDB).where(eq(couponCategoryRulesDB.couponId, couponId));

  const productRulesToInsert: Array<{
    couponId: string;
    productId: string;
    mode: CouponRuleMode;
  }> = [
    ...rules.includeProductIds.map((productId) => ({
      couponId,
      productId,
      mode: "include" as const,
    })),
    ...rules.excludeProductIds.map((productId) => ({
      couponId,
      productId,
      mode: "exclude" as const,
    })),
  ];

  const categoryRulesToInsert: Array<{
    couponId: string;
    categoryId: string;
    mode: CouponRuleMode;
  }> = [
    ...rules.includeCategoryIds.map((categoryId) => ({
      couponId,
      categoryId,
      mode: "include" as const,
    })),
    ...rules.excludeCategoryIds.map((categoryId) => ({
      couponId,
      categoryId,
      mode: "exclude" as const,
    })),
  ];

  if (productRulesToInsert.length > 0) {
    await tx.insert(couponProductRulesDB).values(productRulesToInsert);
  }

  if (categoryRulesToInsert.length > 0) {
    await tx.insert(couponCategoryRulesDB).values(categoryRulesToInsert);
  }
}

function validateResolvedDiscountRange({
  discountType,
  discountValue,
}: {
  discountType: CouponDiscountType;
  discountValue: number;
}) {
  if (discountValue <= 0) {
    throw validation("coupon.discountValue.invalid", "discountValue must be greater than 0");
  }

  if (discountType === "percentage" && discountValue > 10000) {
    throw validation(
      "coupon.discountValue.invalidPercentage",
      "Percentage discountValue must be between 1 and 10000",
    );
  }
}

function validateResolvedPeriodLimit({
  periodLimitType,
  periodLimitCount,
}: {
  periodLimitType: CouponPeriodLimitType | null;
  periodLimitCount: number | null;
}) {
  const hasPeriodType = periodLimitType !== null;
  const hasPeriodCount = periodLimitCount !== null;

  if (hasPeriodType !== hasPeriodCount) {
    throw validation(
      "coupon.periodLimit.invalidConfiguration",
      "periodLimitType and periodLimitCount must be provided together",
    );
  }

  if (periodLimitCount !== null && periodLimitCount <= 0) {
    throw validation("coupon.periodLimitCount.invalid", "periodLimitCount must be greater than 0");
  }
}

export function adminCouponsService(fastify: FastifyInstance): AdminCouponsService {
  return {
    async list({ search, page, pageSize } = {}) {
      const defaultOrderBy: [SQL, ...SQL[]] = [asc(couponsDB.code), asc(couponsDB.id)];
      const fuzzySearch = buildFuzzySearch({
        query: search,
        values: [couponsDB.code],
        tieBreakers: defaultOrderBy,
        threshold: 0.5,
      });

      const paginatedCoupons = await paginate({
        executor: fastify.db,
        createQuery: () => {
          const query = fastify.db
            .select({
              id: couponsDB.id,
              organizationId: couponsDB.organizationId,
              code: couponsDB.code,
              isActive: couponsDB.isActive,
              startsAt: couponsDB.startsAt,
              endsAt: couponsDB.endsAt,
              discountType: couponsDB.discountType,
              discountValue: couponsDB.discountValue,
              periodLimitType: couponsDB.periodLimitType,
              periodLimitCount: couponsDB.periodLimitCount,
              maxRedemptionsPerCustomer: couponsDB.maxRedemptionsPerCustomer,
              createdAt: couponsDB.createdAt,
              updatedAt: couponsDB.updatedAt,
            })
            .from(couponsDB)
            .$dynamic();

          if (fuzzySearch.where) {
            query.where(fuzzySearch.where);
          }

          return query;
        },
        orderBy: fuzzySearch.orderBy ?? defaultOrderBy,
        page,
        pageSize,
      });

      return {
        data: paginatedCoupons.data as CouponListItemResponse[],
        pagination: paginatedCoupons.pagination,
      };
    },

    async create(input) {
      const normalizedInput = normalizeCreateCouponInput(input);
      await assertOrganizationExists(fastify, normalizedInput.organizationId);
      await assertRuleReferencesExist(fastify, normalizedInput.rules);

      try {
        const couponId = generateNanoId();

        await fastify.db.transaction(async (tx) => {
          await tx.insert(couponsDB).values({
            id: couponId,
            organizationId: normalizedInput.organizationId,
            code: normalizedInput.code,
            normalizedCode: normalizedInput.normalizedCode,
            isActive: normalizedInput.isActive,
            startsAt: normalizedInput.startsAt,
            endsAt: normalizedInput.endsAt,
            discountType: normalizedInput.discountType,
            discountValue: normalizedInput.discountValue,
            allowWithLoyaltyFreeDrink: normalizedInput.allowWithLoyaltyFreeDrink,
            periodLimitType: normalizedInput.periodLimitType,
            periodLimitCount: normalizedInput.periodLimitCount,
            maxRedemptionsPerCustomer: normalizedInput.maxRedemptionsPerCustomer,
            minEligibleSubtotalCents: normalizedInput.minEligibleSubtotalCents,
            maxDiscountCents: normalizedInput.maxDiscountCents,
          });

          await replaceCouponRules({
            tx,
            couponId,
            rules: normalizedInput.rules,
          });
        });

        const createdCoupon = await loadCouponWithRules(fastify, couponId);
        if (!createdCoupon) {
          throw new Error("Failed to load created coupon");
        }

        return createdCoupon;
      } catch (error) {
        const pgError = getPgError(error);

        if (pgError?.code === "23505" && pgError.constraint === COUPON_ORG_CODE_UNIQUE_CONSTRAINT) {
          throw conflict("coupon.duplicateCode", "A coupon with this code already exists");
        }

        throw error;
      }
    },

    async getById(couponId) {
      const coupon = await loadCouponWithRules(fastify, couponId);

      if (!coupon) {
        throw notFound("coupon.notFound", "The coupon was not found");
      }

      return coupon;
    },

    async update(couponId, input) {
      const existingCoupon = await loadCouponWithRules(fastify, couponId);
      if (!existingCoupon) {
        throw notFound("coupon.notFound", "The coupon was not found");
      }

      const { updates, rules } = normalizeUpdateCouponInput(input);

      const resolvedDiscountType =
        (updates.discountType ?? existingCoupon.discountType) as CouponDiscountType;
      const resolvedDiscountValue = updates.discountValue ?? existingCoupon.discountValue;
      validateResolvedDiscountRange({
        discountType: resolvedDiscountType,
        discountValue: resolvedDiscountValue,
      });

      const resolvedPeriodLimitType =
        (updates.periodLimitType === undefined
          ? existingCoupon.periodLimitType
          : updates.periodLimitType) ?? null;
      const resolvedPeriodLimitCount =
        (updates.periodLimitCount === undefined
          ? existingCoupon.periodLimitCount
          : updates.periodLimitCount) ?? null;

      validateResolvedPeriodLimit({
        periodLimitType: resolvedPeriodLimitType,
        periodLimitCount: resolvedPeriodLimitCount,
      });

      const resolvedStartsAt = updates.startsAt ?? existingCoupon.startsAt;
      const resolvedEndsAt =
        updates.endsAt === undefined ? existingCoupon.endsAt : updates.endsAt;
      if (resolvedEndsAt && resolvedEndsAt.getTime() < resolvedStartsAt.getTime()) {
        throw validation("coupon.validityRange.invalid", "endsAt cannot be before startsAt");
      }

      if (rules) {
        await assertRuleReferencesExist(fastify, rules);
      }

      const valuesToUpdate = {
        ...updates,
        updatedAt: new Date(),
      };

      try {
        await fastify.db.transaction(async (tx) => {
          if (Object.keys(valuesToUpdate).length > 1) {
            await tx.update(couponsDB).set(valuesToUpdate).where(eq(couponsDB.id, couponId));
          }

          if (rules) {
            await replaceCouponRules({ tx, couponId, rules });
          }
        });
      } catch (error) {
        const pgError = getPgError(error);

        if (pgError?.code === "23505" && pgError.constraint === COUPON_ORG_CODE_UNIQUE_CONSTRAINT) {
          throw conflict("coupon.duplicateCode", "A coupon with this code already exists");
        }

        throw error;
      }

      const updatedCoupon = await loadCouponWithRules(fastify, couponId);
      if (!updatedCoupon) {
        throw new Error("Failed to load updated coupon");
      }

      return updatedCoupon;
    },

    async updateStatus(couponId, input) {
      const existingCoupon = await fastify.db.query.couponsDB.findFirst({
        where(table, { eq: eqOperator }) {
          return eqOperator(table.id, couponId);
        },
        columns: {
          id: true,
        },
      });

      if (!existingCoupon) {
        throw notFound("coupon.notFound", "The coupon was not found");
      }

      await fastify.db
        .update(couponsDB)
        .set({
          isActive: input.isActive,
          updatedAt: new Date(),
        })
        .where(eq(couponsDB.id, couponId));

      const updatedCoupon = await loadCouponWithRules(fastify, couponId);
      if (!updatedCoupon) {
        throw new Error("Failed to load updated coupon");
      }

      return updatedCoupon;
    },
  };
}

export async function findCouponByCodeForOrganization(
  fastify: FastifyInstance,
  organizationId: string,
  couponCode: string,
): Promise<Coupon | null> {
  const coupon = await fastify.db.query.couponsDB.findFirst({
    where(table, { and, eq: eqOperator }) {
      return and(
        eqOperator(table.organizationId, organizationId),
        eqOperator(table.normalizedCode, couponCode),
      );
    },
  });

  return coupon ?? null;
}
