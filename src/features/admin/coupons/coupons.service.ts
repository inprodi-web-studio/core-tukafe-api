import {
  couponCategoryRulesDB,
  couponProductRulesDB,
  couponRedemptionsDB,
  couponsDB,
  memberDB,
  productCategoriesDB,
  productsDB,
  type Coupon,
  type CouponDiscountType,
  type CouponPeriodLimitType,
  type CouponRuleMode,
} from "@core/db/schemas";
import {
  conflict,
  forbidden,
  generateNanoId,
  getPgError,
  notFound,
  paginate,
  validation,
} from "@core/utils";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import {
  mapCouponRulesResponse,
  normalizeCreateCouponInput,
  normalizeUpdateCouponInput,
} from "./coupons.helpers";
import type {
  AdminCouponsService,
  CouponEffectiveStatus,
  CouponListParams,
  CouponListItemResponse,
  CouponResponse,
  CouponRuleSetResponse,
} from "./coupons.types";

const COUPON_ORG_CODE_UNIQUE_CONSTRAINT = "coupon_org_normalized_code_unique";
const parentCategory = alias(productCategoriesDB, "coupon_rule_parent_category");
type TransactionDb = Parameters<Parameters<FastifyInstance["db"]["transaction"]>[0]>[0];

async function assertRuleReferencesExist(
  fastify: FastifyInstance,
  rules: CouponRuleSetResponse,
): Promise<void> {
  const uniqueProductIds = [...new Set([...rules.includeProductIds, ...rules.excludeProductIds])];
  const uniqueCategoryIds = [
    ...new Set([...rules.includeCategoryIds, ...rules.excludeCategoryIds]),
  ];

  const [products, categories] = await Promise.all([
    uniqueProductIds.length > 0
      ? fastify.db
          .select({ id: productsDB.id })
          .from(productsDB)
          .where(and(inArray(productsDB.id, uniqueProductIds), isNull(productsDB.deletedAt)))
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
  organizationId?: string,
): Promise<CouponResponse | null> {
  const coupon = await fastify.db.query.couponsDB.findFirst({
    where(table, { and: andOperator, eq: eqOperator }) {
      return organizationId
        ? andOperator(
            eqOperator(table.id, couponId),
            eqOperator(table.organizationId, organizationId),
          )
        : eqOperator(table.id, couponId);
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

function effectiveStatusExpression(now: Date) {
  return sql<CouponEffectiveStatus>`case
    when not ${couponsDB.isActive} then 'inactive'
    when ${couponsDB.startsAt} > ${now} then 'scheduled'
    when ${couponsDB.endsAt} is not null and ${couponsDB.endsAt} < ${now} then 'expired'
    else 'active'
  end`;
}

function resolveListOrderBy(
  input: Pick<CouponListParams, "sortBy" | "sortDirection">,
  redemptionCount: SQL<number>,
  totalDiscountCents: SQL<number>,
): [SQL, ...SQL[]] {
  const order = input.sortDirection === "asc" ? asc : desc;
  const column = {
    code: couponsDB.code,
    startsAt: couponsDB.startsAt,
    endsAt: couponsDB.endsAt,
    redemptions: redemptionCount,
    discountAmount: totalDiscountCents,
    updatedAt: couponsDB.updatedAt,
  }[input.sortBy];

  return [order(column), asc(couponsDB.id)];
}

export function adminCouponsService(fastify: FastifyInstance): AdminCouponsService {
  return {
    async list(input) {
      const now = new Date();
      const normalizedSearch = input.search?.trim();
      const effectiveStatus = effectiveStatusExpression(now);
      const redemptionCount = sql<number>`coalesce(count(${couponRedemptionsDB.id}), 0)::int`;
      const totalDiscountCents = sql<number>`coalesce(sum(${couponRedemptionsDB.discountCents}), 0)::bigint`;
      const orderBy = resolveListOrderBy(input, redemptionCount, totalDiscountCents);

      const paginatedCoupons = await paginate({
        executor: fastify.db,
        createQuery: () => {
          const filters: SQL[] = [eq(couponsDB.organizationId, input.organizationId)];
          if (normalizedSearch) {
            filters.push(ilike(couponsDB.code, `%${normalizedSearch}%`));
          }
          if (input.discountType) {
            filters.push(eq(couponsDB.discountType, input.discountType));
          }
          if (input.status) {
            filters.push(sql`${effectiveStatus} = ${input.status}`);
          }

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
              effectiveStatus,
              allowWithLoyaltyFreeDrink: couponsDB.allowWithLoyaltyFreeDrink,
              periodLimitType: couponsDB.periodLimitType,
              periodLimitCount: couponsDB.periodLimitCount,
              maxRedemptionsPerCustomer: couponsDB.maxRedemptionsPerCustomer,
              minEligibleSubtotalCents: couponsDB.minEligibleSubtotalCents,
              maxDiscountCents: couponsDB.maxDiscountCents,
              redemptionCount,
              totalDiscountCents,
              createdAt: couponsDB.createdAt,
              updatedAt: couponsDB.updatedAt,
            })
            .from(couponsDB)
            .leftJoin(couponRedemptionsDB, eq(couponRedemptionsDB.couponId, couponsDB.id))
            .where(and(...filters))
            .groupBy(couponsDB.id)
            .$dynamic();

          return query;
        },
        orderBy,
        page: input.page,
        pageSize: input.pageSize,
      });

      return {
        data: paginatedCoupons.data.map((coupon) => ({
          ...coupon,
          redemptionCount: Number(coupon.redemptionCount),
          totalDiscountCents: Number(coupon.totalDiscountCents),
        })) as CouponListItemResponse[],
        pagination: paginatedCoupons.pagination,
      };
    },

    async create(input) {
      const normalizedInput = normalizeCreateCouponInput(input);
      await assertRuleReferencesExist(fastify, normalizedInput.rules);

      try {
        const couponIds = normalizedInput.organizationIds.map(() => generateNanoId());

        await fastify.db.transaction(async (tx) => {
          const memberships = await tx
            .select({ organizationId: memberDB.organizationId })
            .from(memberDB)
            .where(
              and(
                eq(memberDB.userId, input.creatorUserId),
                inArray(memberDB.organizationId, normalizedInput.organizationIds),
                inArray(memberDB.role, ["owner", "admin"]),
              ),
            );
          const authorizedIds = new Set(memberships.map((membership) => membership.organizationId));
          if (
            normalizedInput.organizationIds.some(
              (organizationId) => !authorizedIds.has(organizationId),
            )
          ) {
            throw forbidden(
              "coupon.organizationAccessDenied",
              "The user cannot create coupons for one or more organizations",
            );
          }

          const conflicts = await tx
            .select({ organizationId: couponsDB.organizationId })
            .from(couponsDB)
            .where(
              and(
                inArray(couponsDB.organizationId, normalizedInput.organizationIds),
                eq(couponsDB.normalizedCode, normalizedInput.normalizedCode),
              ),
            );
          if (conflicts.length > 0) {
            throw conflict("coupon.duplicateCode", "A coupon with this code already exists", {
              organizationIds: conflicts.map((item) => item.organizationId),
            });
          }

          await tx.insert(couponsDB).values(
            normalizedInput.organizationIds.map((organizationId, index) => ({
              id: couponIds[index]!,
              organizationId,
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
            })),
          );

          for (const couponId of couponIds) {
            await replaceCouponRules({ tx, couponId, rules: normalizedInput.rules });
          }
        });

        const createdCoupons = await Promise.all(
          couponIds.map((couponId) => loadCouponWithRules(fastify, couponId)),
        );
        if (createdCoupons.some((coupon) => !coupon)) {
          throw new Error("Failed to load created coupon");
        }

        return { data: createdCoupons as CouponResponse[] };
      } catch (error) {
        const pgError = getPgError(error);

        if (pgError?.code === "23505" && pgError.constraint === COUPON_ORG_CODE_UNIQUE_CONSTRAINT) {
          throw conflict("coupon.duplicateCode", "A coupon with this code already exists");
        }

        throw error;
      }
    },

    async getById(couponId, organizationId) {
      const coupon = await loadCouponWithRules(fastify, couponId, organizationId);

      if (!coupon) {
        throw notFound("coupon.notFound", "The coupon was not found");
      }

      return coupon;
    },

    async update(couponId, input) {
      const existingCoupon = await loadCouponWithRules(fastify, couponId, input.organizationId);
      if (!existingCoupon) {
        throw notFound("coupon.notFound", "The coupon was not found");
      }

      const { updates, rules } = normalizeUpdateCouponInput(input);

      const resolvedDiscountType = (updates.discountType ??
        existingCoupon.discountType) as CouponDiscountType;
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
      const resolvedEndsAt = updates.endsAt === undefined ? existingCoupon.endsAt : updates.endsAt;
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
            await tx
              .update(couponsDB)
              .set(valuesToUpdate)
              .where(
                and(eq(couponsDB.id, couponId), eq(couponsDB.organizationId, input.organizationId)),
              );
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

      const updatedCoupon = await loadCouponWithRules(fastify, couponId, input.organizationId);
      if (!updatedCoupon) {
        throw new Error("Failed to load updated coupon");
      }

      return updatedCoupon;
    },

    async updateStatus(couponId, organizationId, input) {
      const existingCoupon = await fastify.db.query.couponsDB.findFirst({
        where(table, { and: andOperator, eq: eqOperator }) {
          return andOperator(
            eqOperator(table.id, couponId),
            eqOperator(table.organizationId, organizationId),
          );
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
        .where(and(eq(couponsDB.id, couponId), eq(couponsDB.organizationId, organizationId)));

      const updatedCoupon = await loadCouponWithRules(fastify, couponId, organizationId);
      if (!updatedCoupon) {
        throw new Error("Failed to load updated coupon");
      }

      return updatedCoupon;
    },

    async listRuleOptions({ resource, page, pageSize, search, ids }) {
      const normalizedSearch = search?.trim();

      if (resource === "product") {
        return paginate({
          executor: fastify.db,
          createQuery: () => {
            const filters: SQL[] = [isNull(productsDB.deletedAt)];
            if (ids?.length) filters.push(inArray(productsDB.id, ids));
            if (normalizedSearch) {
              const pattern = `%${normalizedSearch}%`;
              const filter = or(
                ilike(productsDB.name, pattern),
                ilike(productsDB.kitchenName, pattern),
              );
              if (filter) filters.push(filter);
            }

            return fastify.db
              .select({
                id: productsDB.id,
                label: productsDB.name,
                description: productsDB.kitchenName,
              })
              .from(productsDB)
              .where(and(...filters))
              .$dynamic();
          },
          orderBy: [asc(productsDB.name), asc(productsDB.id)],
          page,
          pageSize,
        });
      }

      return paginate({
        executor: fastify.db,
        createQuery: () => {
          const filters: SQL[] = [];
          if (ids?.length) filters.push(inArray(productCategoriesDB.id, ids));
          if (normalizedSearch) {
            filters.push(ilike(productCategoriesDB.name, `%${normalizedSearch}%`));
          }

          const query = fastify.db
            .select({
              id: productCategoriesDB.id,
              label: productCategoriesDB.name,
              description: parentCategory.name,
            })
            .from(productCategoriesDB)
            .leftJoin(parentCategory, eq(productCategoriesDB.parentId, parentCategory.id))
            .$dynamic();
          if (filters.length > 0) query.where(and(...filters));
          return query;
        },
        orderBy: [asc(productCategoriesDB.name), asc(productCategoriesDB.id)],
        page,
        pageSize,
      });
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
