import {
  couponPeriodUsagesDB,
  couponRedemptionsDB,
  customerCashbackAccountsDB,
  customerCashbackLedgerDB,
  customersDB,
  customerOrderPromotionStatesDB,
  orderPaymentAttemptsDB,
  orderItemCompoundComponentsDB,
  orderItemModifiersDB,
  orderItemsDB,
  orderItemTaxesDB,
  ordersDB,
  workOrdersDB,
} from "@core/db/schemas";
import { conflict, generateNanoId, getPgError, notFound, validation } from "@core/utils";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  prepareOrderInventory,
  releaseCheckoutInventory,
  reserveCheckoutInventory,
  reserveOrderInventory,
} from "@features/shared/inventory";
import {
  applyCouponToPreparedOrder,
  resolveCouponPeriodStartDate,
  validateCouponPromotionCompatibility,
  validateCouponWindow,
  type CouponWithRules,
} from "./orders.coupons";
import {
  buildOrderFolioPrefix,
  calculateTipCents,
  formatOrderFolio,
  normalizeCreateOrderInput,
} from "./orders.helpers";
import { mapOrderResponse } from "./orders.mappers";
import { ORDER_PROMOTION_CODE, applyBuy4Get1Promotion } from "./orders.promotions";
import type {
  CreateOrderParams,
  CreateOrderPaymentAttemptParams,
  NormalizedCreateOrderParams,
  OrderPaymentAttemptResponse,
  OrderCouponResponse,
  OrderPreviewResponse,
  OrderPromotionResponse,
  RecordOrderPaymentAttemptResultParams,
  OrderPromotionState,
  OrderResponse,
  OrderSource,
} from "./orders.types";
import {
  buildOrderValidationContext,
  type PreparedOrderPayload,
  validateAndPrepareOrderPayload,
  validateOrderCustomer,
  validateOrderOrganization,
} from "./orders.validators";

const FOLIO_MAX_SEQUENCE = 999999;
const MAX_FOLIO_RETRY_ATTEMPTS = 5;
const ORDER_FOLIO_UNIQUE_CONSTRAINT = "order_organization_folio_unique";
const COUPON_REDEMPTION_UNIQUE_ORDER_CONSTRAINT = "coupon_redemption_order_id_unique";

interface PromotionStateLockExecutor {
  execute(query: unknown): Promise<{ rows: Record<string, unknown>[] }>;
}

type TransactionDb = Parameters<Parameters<FastifyInstance["db"]["transaction"]>[0]>[0];
type WorkOrderInsert = typeof workOrdersDB.$inferInsert;

interface CouponConsumptionMetadata {
  couponId: string;
  couponCode: string;
  periodType: "day" | "week" | "month" | null;
  periodStartDate: string | null;
}

interface CalculatedOrderPayload {
  payload: PreparedOrderPayload;
  promotion: OrderPromotionResponse | null;
  coupon: OrderCouponResponse | null;
  couponConsumption: CouponConsumptionMetadata | null;
  nextPromotionState: OrderPromotionState | null;
  tipCents: number;
  grandTotalCents: number;
  amountDueCents: number;
  cashbackBalanceCents: number | null;
  cashbackRedemptionCents: number;
  cashbackEarnedCents: number;
  cashbackEligiblePaidCents: number;
}

interface OrderCalculationOptions {
  allowCashbackRedemption?: boolean;
  exposeCashbackBalance?: boolean;
}

interface CreateOrderOptions extends OrderCalculationOptions {
  requirePaymentForPositiveAmountDue?: boolean;
  source?: OrderSource;
}

interface CashbackAccountSnapshot {
  balanceCents: number;
  totalEarnedCents: number;
  totalRedeemedCents: number;
}

interface OrderItemResponseMetadata {
  sourceClientItemId: string | null;
  lineType: "paid" | "free";
  displayUnitPriceCents: number;
}

interface WorkOrderCustomerDisplaySource {
  name: string | null;
  middleName: string | null;
  lastName: string | null;
  phone: string | null;
}

async function notifyWorkOrderCreated(tx: TransactionDb, workOrder: WorkOrderInsert) {
  await tx.execute(sql`
    select pg_notify(
      'work_order_events',
      json_build_object(
        'type', 'workOrder.created',
        'organizationId', ${workOrder.organizationId}::text,
        'workOrderId', ${workOrder.id}::text
      )::text
    )
  `);
}

function clonePreparedPayload(payload: PreparedOrderPayload): PreparedOrderPayload {
  return {
    ...payload,
    items: payload.items.map((preparedOrderItem) => ({
      ...preparedOrderItem,
      item: {
        ...preparedOrderItem.item,
      },
      modifiers: preparedOrderItem.modifiers.map((modifier) => ({ ...modifier })),
      taxes: preparedOrderItem.taxes.map((tax) => ({ ...tax })),
      workOrderSnapshot: {
        productKitchenName: preparedOrderItem.workOrderSnapshot.productKitchenName,
        variationSelections: preparedOrderItem.workOrderSnapshot.variationSelections.map(
          (selection) => ({
            ...selection,
          }),
        ),
        modifiers: preparedOrderItem.workOrderSnapshot.modifiers.map((modifier) => ({
          ...modifier,
        })),
      },
    })),
  };
}

function buildCouponCustomerLockKey(couponId: string, customerId: string): number {
  const value = `${couponId}:${customerId}`;
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }

  return Math.abs(hash) || 1;
}

function resolveCustomerDisplayName(
  customer: WorkOrderCustomerDisplaySource | null,
): string | null {
  if (!customer) {
    return null;
  }

  const fullName = [customer.name, customer.middleName, customer.lastName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" ");

  return fullName || customer.phone || null;
}

async function loadWorkOrderCustomerDisplayName(
  tx: TransactionDb,
  customerId: string | null,
): Promise<string | null> {
  if (!customerId) {
    return null;
  }

  const [customer] = await tx
    .select({
      name: customersDB.name,
      middleName: customersDB.middleName,
      lastName: customersDB.lastName,
      phone: customersDB.phone,
    })
    .from(customersDB)
    .where(eq(customersDB.id, customerId))
    .limit(1);

  return resolveCustomerDisplayName(customer ?? null);
}

function buildWorkOrderRows({
  payload,
  organizationId,
  orderId,
  orderFolio,
  customerDisplayName,
  orderComment,
  scheduledFor,
}: {
  payload: PreparedOrderPayload;
  organizationId: string;
  orderId: string;
  orderFolio: string;
  customerDisplayName: string | null;
  orderComment: string | null;
  scheduledFor: Date | null;
}): WorkOrderInsert[] {
  return payload.items.flatMap((preparedOrderItem) => {
    const quantity = preparedOrderItem.item.quantity ?? 0;
    const unitCount = Number.isInteger(quantity) ? Math.max(1, Math.trunc(quantity)) : 1;
    const quantitySnapshot = Number.isInteger(quantity) ? 1 : quantity;

    if (preparedOrderItem.compoundComponents.length > 0) {
      return preparedOrderItem.compoundComponents.flatMap((component) => {
        const componentUnitCount = Math.max(1, component.quantity ?? 1);

        return Array.from({ length: unitCount * componentUnitCount }, (_, index) => ({
          id: generateNanoId(),
          organizationId,
          orderId,
          orderItemId: preparedOrderItem.item.id ?? "",
          orderFolio,
          customerDisplayName,
          productName: component.productName,
          productKitchenName: component.productKitchenName,
          variationName: component.variationName ?? null,
          variationSelectionsSnapshot: component.variationSelectionsSnapshot ?? [],
          modifiersSnapshot: (component.modifiersSnapshot ?? []).map((modifier) => ({
            modifierId: modifier.modifierId,
            modifierName: modifier.modifierName,
            modifierKitchenName: modifier.modifierKitchenName,
            modifierOptionId: modifier.modifierOptionId,
            modifierOptionName: modifier.modifierOptionName,
            modifierOptionKitchenName: modifier.modifierOptionKitchenName,
            quantity: modifier.quantity,
          })),
          orderComment,
          itemComment: preparedOrderItem.item.comment ?? null,
          scheduledFor,
          unitIndex: index + 1,
          quantitySnapshot,
          status: "open",
        }));
      });
    }

    return Array.from({ length: unitCount }, (_, index) => ({
      id: generateNanoId(),
      organizationId,
      orderId,
      orderItemId: preparedOrderItem.item.id ?? "",
      orderFolio,
      customerDisplayName,
      productName: preparedOrderItem.item.productName ?? "",
      productKitchenName: preparedOrderItem.workOrderSnapshot.productKitchenName,
      variationName: preparedOrderItem.item.variationName ?? null,
      variationSelectionsSnapshot: preparedOrderItem.workOrderSnapshot.variationSelections,
      modifiersSnapshot: preparedOrderItem.workOrderSnapshot.modifiers,
      orderComment,
      itemComment: preparedOrderItem.item.comment ?? null,
      scheduledFor,
      unitIndex: index + 1,
      quantitySnapshot,
      status: "open",
    }));
  });
}

async function loadCouponByCode({
  fastify,
  organizationId,
  couponCode,
}: {
  fastify: FastifyInstance;
  organizationId: string;
  couponCode: string;
}): Promise<CouponWithRules> {
  const coupon = await fastify.db.query.couponsDB.findFirst({
    where(table, { and, eq: eqOperator }) {
      return and(
        eqOperator(table.organizationId, organizationId),
        eqOperator(table.normalizedCode, couponCode),
      );
    },
    with: {
      productRules: true,
      categoryRules: true,
    },
  });

  if (!coupon) {
    throw validation("coupon.notFound", "Coupon code was not found");
  }

  const resolvedCategoryRules = await fastify.db.execute<{
    categoryId: string;
    mode: "include" | "exclude";
  }>(sql`
    with recursive category_descendants as (
      select rule.category_id as "categoryId", rule.mode
      from coupon_category_rule rule
      where rule.coupon_id = ${coupon.id}

      union

      select child.id as "categoryId", descendants.mode
      from product_category child
      inner join category_descendants descendants
        on child.parent_id = descendants."categoryId"
    )
    select "categoryId", mode
    from category_descendants
  `);

  return { ...coupon, resolvedCategoryRules: resolvedCategoryRules.rows };
}

export async function loadOrder(
  fastify: FastifyInstance,
  id: string,
  safe = false,
): Promise<OrderResponse | null> {
  const order = await fastify.db.query.ordersDB.findFirst({
    where(table, { eq: eqOperator }) {
      return eqOperator(table.id, id);
    },
    with: {
      customer: {
        columns: {
          id: true,
          userId: true,
          name: true,
          middleName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
      paymentAttempts: true,
      items: {
        with: {
          compoundComponents: true,
          modifiers: true,
          taxes: true,
        },
      },
    },
  });

  if (!order && !safe) {
    throw notFound("order.notFound", "The order was not found");
  }

  if (!order) {
    return null;
  }

  return mapOrderResponse(order);
}

function normalizePaymentAttemptResponse(
  paymentAttempt: typeof orderPaymentAttemptsDB.$inferSelect,
): OrderPaymentAttemptResponse {
  return {
    ...paymentAttempt,
    provider: paymentAttempt.provider as OrderPaymentAttemptResponse["provider"],
    status: paymentAttempt.status as OrderPaymentAttemptResponse["status"],
    customerId: paymentAttempt.customerId ?? null,
    orderId: paymentAttempt.orderId ?? null,
    transactionId: paymentAttempt.transactionId ?? null,
    referenceNumber: paymentAttempt.referenceNumber ?? null,
    cardBrand: paymentAttempt.cardBrand ?? null,
    entryMode: paymentAttempt.entryMode ?? null,
    authorizationCode: paymentAttempt.authorizationCode ?? null,
    obfuscatedPan: paymentAttempt.obfuscatedPan ?? null,
    orderPayload: paymentAttempt.orderPayload ?? null,
    rawResponse: paymentAttempt.rawResponse ?? null,
    failureCode: paymentAttempt.failureCode ?? null,
    failureMessage: paymentAttempt.failureMessage ?? null,
  };
}

export async function loadPaymentAttempt(
  fastify: FastifyInstance,
  paymentAttemptId: string,
): Promise<OrderPaymentAttemptResponse> {
  const paymentAttempt = await fastify.db.query.orderPaymentAttemptsDB.findFirst({
    where(table, { eq: eqOperator }) {
      return eqOperator(table.id, paymentAttemptId);
    },
  });

  if (!paymentAttempt) {
    throw notFound("order.paymentAttempt.notFound", "The payment attempt was not found");
  }

  return normalizePaymentAttemptResponse(paymentAttempt);
}

async function lockPaymentAttempt(
  tx: TransactionDb,
  paymentAttemptId: string,
): Promise<OrderPaymentAttemptResponse | null> {
  const result = await tx.execute(sql`
    select
      id,
      organization_id as "organizationId",
      customer_id as "customerId",
      order_id as "orderId",
      provider,
      reference,
      amount_cents as "amountCents",
      currency,
      status,
      transaction_id as "transactionId",
      reference_number as "referenceNumber",
      card_brand as "cardBrand",
      entry_mode as "entryMode",
      authorization_code as "authorizationCode",
      obfuscated_pan as "obfuscatedPan",
      order_payload as "orderPayload",
      raw_response as "rawResponse",
      failure_code as "failureCode",
      failure_message as "failureMessage",
      created_at as "createdAt",
      updated_at as "updatedAt"
    from order_payment_attempt
    where id = ${paymentAttemptId}
    for update
  `);

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return normalizePaymentAttemptResponse(row as typeof orderPaymentAttemptsDB.$inferSelect);
}

async function markPaymentAttemptRequiresReconciliation(
  fastify: FastifyInstance,
  paymentAttemptId: string | null | undefined,
  error: unknown,
) {
  if (!paymentAttemptId) {
    return;
  }

  const message = error instanceof Error ? error.message : "Order creation failed after payment";

  await fastify.db
    .update(orderPaymentAttemptsDB)
    .set({
      status: "requires_reconciliation",
      failureCode: "order.createFailed",
      failureMessage: message,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(orderPaymentAttemptsDB.id, paymentAttemptId),
        eq(orderPaymentAttemptsDB.status, "paid_unlinked"),
      ),
    );
}

async function loadCustomerPromotionState(
  fastify: FastifyInstance,
  customerId: string,
): Promise<OrderPromotionState | null> {
  const state = await fastify.db.query.customerOrderPromotionStatesDB.findFirst({
    where(table, { eq: eqOperator }) {
      return eqOperator(table.customerId, customerId);
    },
    columns: {
      progressCount: true,
      candidateProductIds: true,
      legacyFreeDrinkGrantedAt: true,
      legacyFreeDrinkRedeemedAt: true,
    },
  });

  if (!state) {
    return null;
  }

  return {
    progressCount: state.progressCount,
    candidateProductIds: state.candidateProductIds,
    legacyFreeDrinkGrantedAt: normalizeNullableDate(state.legacyFreeDrinkGrantedAt),
    legacyFreeDrinkRedeemedAt: normalizeNullableDate(state.legacyFreeDrinkRedeemedAt),
  };
}

function normalizeNullableDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

async function loadCustomerCashbackAccount(
  fastify: FastifyInstance,
  customerId: string,
): Promise<CashbackAccountSnapshot> {
  const account = await fastify.db.query.customerCashbackAccountsDB.findFirst({
    where(table, { eq: eqOperator }) {
      return eqOperator(table.customerId, customerId);
    },
    columns: {
      balanceCents: true,
      totalEarnedCents: true,
      totalRedeemedCents: true,
    },
  });

  return {
    balanceCents: account?.balanceCents ?? 0,
    totalEarnedCents: account?.totalEarnedCents ?? 0,
    totalRedeemedCents: account?.totalRedeemedCents ?? 0,
  };
}

async function lockCustomerCashbackAccount(
  tx: TransactionDb,
  customerId: string,
): Promise<CashbackAccountSnapshot> {
  await tx
    .insert(customerCashbackAccountsDB)
    .values({
      customerId,
      balanceCents: 0,
      totalEarnedCents: 0,
      totalRedeemedCents: 0,
      version: 0,
    })
    .onConflictDoNothing();

  const result = await tx.execute(sql`
    select
      balance_cents as "balanceCents",
      total_earned_cents as "totalEarnedCents",
      total_redeemed_cents as "totalRedeemedCents"
    from customer_cashback_account
    where customer_id = ${customerId}
    for update
  `);

  const row = result.rows[0];
  if (!row) {
    throw new Error("Failed to lock customer cashback account");
  }

  return {
    balanceCents: Number(row.balanceCents ?? 0),
    totalEarnedCents: Number(row.totalEarnedCents ?? 0),
    totalRedeemedCents: Number(row.totalRedeemedCents ?? 0),
  };
}

async function lockCustomerPromotionState(
  tx: PromotionStateLockExecutor,
  customerId: string,
): Promise<OrderPromotionState | null> {
  const result = await tx.execute(sql`
    select
      customer_id as "customerId",
      progress_count as "progressCount",
      candidate_product_ids as "candidateProductIds",
      legacy_free_drink_granted_at as "legacyFreeDrinkGrantedAt",
      legacy_free_drink_redeemed_at as "legacyFreeDrinkRedeemedAt"
    from customer_order_promotion_state
    where customer_id = ${customerId}
    for update
  `);

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    progressCount: Number(row.progressCount ?? 0),
    candidateProductIds: Array.isArray(row.candidateProductIds)
      ? row.candidateProductIds.filter((value): value is string => typeof value === "string")
      : [],
    legacyFreeDrinkGrantedAt: normalizeNullableDate(row.legacyFreeDrinkGrantedAt),
    legacyFreeDrinkRedeemedAt: normalizeNullableDate(row.legacyFreeDrinkRedeemedAt),
  };
}

function distributeIntegerAmountByWeights({
  total,
  weights,
}: {
  total: number;
  weights: number[];
}): number[] {
  if (total <= 0 || weights.length === 0) {
    return weights.map(() => 0);
  }

  const weightSum = weights.reduce((accumulator, value) => accumulator + Math.max(0, value), 0);
  if (weightSum <= 0) {
    return weights.map(() => 0);
  }

  const rawShares = weights.map((weight) => (total * Math.max(0, weight)) / weightSum);
  const baseShares = rawShares.map((value) => Math.floor(value));
  let remaining = total - baseShares.reduce((accumulator, value) => accumulator + value, 0);

  const sortedByRemainder = rawShares
    .map((value, index) => ({
      index,
      remainder: value - Math.floor(value),
    }))
    .sort((left, right) => {
      if (right.remainder !== left.remainder) {
        return right.remainder - left.remainder;
      }

      return left.index - right.index;
    });

  for (const candidate of sortedByRemainder) {
    if (remaining <= 0) {
      break;
    }

    baseShares[candidate.index] = (baseShares[candidate.index] ?? 0) + 1;
    remaining -= 1;
  }

  return baseShares;
}

function calculateCashbackAmounts({
  payload,
  customerId,
  requestedRedemptionCents,
  cashbackBalanceCents,
  orderGrandTotalCents,
  allowCashbackRedemption,
}: {
  payload: PreparedOrderPayload;
  customerId: string | null;
  requestedRedemptionCents: number;
  cashbackBalanceCents: number | null;
  orderGrandTotalCents: number;
  allowCashbackRedemption: boolean;
}): {
  amountDueCents: number;
  cashbackRedemptionCents: number;
  cashbackEarnedCents: number;
  cashbackEligiblePaidCents: number;
} {
  if (requestedRedemptionCents > 0 && !allowCashbackRedemption) {
    throw validation(
      "cashback.redemption.notAllowed",
      "Cashback redemption is only available for authenticated customer orders",
    );
  }

  if (requestedRedemptionCents > 0 && !customerId) {
    throw validation("cashback.customerRequired", "A customer is required to redeem cashback");
  }

  if (requestedRedemptionCents > (cashbackBalanceCents ?? 0)) {
    throw validation("cashback.insufficientBalance", "Cashback balance is insufficient", {
      balanceCents: cashbackBalanceCents ?? 0,
      requestedCents: requestedRedemptionCents,
    });
  }

  if (requestedRedemptionCents > orderGrandTotalCents) {
    throw validation(
      "cashback.redemption.exceedsOrderTotal",
      "Cashback redemption cannot exceed order total",
      {
        orderTotalCents: orderGrandTotalCents,
        requestedCents: requestedRedemptionCents,
      },
    );
  }

  const itemTotals = payload.items.map((preparedOrderItem) =>
    Math.max(0, preparedOrderItem.item.grandTotalCents ?? 0),
  );
  const itemTotalCents = itemTotals.reduce((total, itemTotal) => total + itemTotal, 0);
  const redemptionAppliedToItemsCents = Math.min(requestedRedemptionCents, itemTotalCents);
  const redemptionByItem = distributeIntegerAmountByWeights({
    total: redemptionAppliedToItemsCents,
    weights: itemTotals,
  });

  let cashbackEligibleTotalCents = 0;
  let cashbackEligibleRedemptionCents = 0;

  for (const [index, preparedOrderItem] of payload.items.entries()) {
    if (!preparedOrderItem.isCashbackEligible) {
      continue;
    }

    cashbackEligibleTotalCents += itemTotals[index] ?? 0;
    cashbackEligibleRedemptionCents += redemptionByItem[index] ?? 0;
  }

  const cashbackEligiblePaidCents = customerId
    ? Math.max(0, cashbackEligibleTotalCents - cashbackEligibleRedemptionCents)
    : 0;
  const cashbackEarnedCents = Math.floor(cashbackEligiblePaidCents / 10);

  return {
    amountDueCents: orderGrandTotalCents - requestedRedemptionCents,
    cashbackRedemptionCents: requestedRedemptionCents,
    cashbackEarnedCents,
    cashbackEligiblePaidCents,
  };
}

function mapPreparedPayloadItemsToResponse(
  payload: PreparedOrderPayload,
): OrderPreviewResponse["items"] {
  return payload.items.map((preparedOrderItem) => ({
    id: preparedOrderItem.item.id ?? "",
    productId: preparedOrderItem.item.productId ?? "",
    variationId: preparedOrderItem.item.variationId ?? null,
    unitId: preparedOrderItem.item.unitId ?? "",
    productName: preparedOrderItem.item.productName ?? "",
    variationName: preparedOrderItem.item.variationName ?? null,
    unitName: preparedOrderItem.item.unitName ?? "",
    unitAbbreviation: preparedOrderItem.item.unitAbbreviation ?? "",
    unitPrecision: preparedOrderItem.item.unitPrecision ?? 0,
    quantity: preparedOrderItem.item.quantity ?? 0,
    comment: preparedOrderItem.item.comment ?? null,
    unitPriceCents: preparedOrderItem.item.unitPriceCents ?? 0,
    displayUnitPriceCents: preparedOrderItem.displayUnitPriceCents,
    modifiersSubtotalCents: preparedOrderItem.item.modifiersSubtotalCents ?? 0,
    freeUnits: preparedOrderItem.item.freeUnits ?? 0,
    promotionCode: preparedOrderItem.item.promotionCode ?? null,
    promotionDiscountCents: preparedOrderItem.item.promotionDiscountCents ?? 0,
    couponDiscountCents: preparedOrderItem.item.couponDiscountCents ?? 0,
    subtotalCents: preparedOrderItem.item.subtotalCents ?? 0,
    taxesCents: preparedOrderItem.item.taxesCents ?? 0,
    grandTotalCents: preparedOrderItem.item.grandTotalCents ?? 0,
    sortOrder: preparedOrderItem.item.sortOrder ?? 0,
    sourceClientItemId: preparedOrderItem.sourceClientItemId,
    lineType: preparedOrderItem.lineType,
    compoundComponents: [...preparedOrderItem.compoundComponents]
      .sort((left, right) => {
        const leftSortOrder = left.sortOrder ?? 0;
        const rightSortOrder = right.sortOrder ?? 0;

        if (leftSortOrder !== rightSortOrder) {
          return leftSortOrder - rightSortOrder;
        }

        return left.id.localeCompare(right.id);
      })
      .map((component) => ({
        id: component.id,
        compoundProductId: component.compoundProductId,
        slotId: component.slotId ?? null,
        slotOptionId: component.slotOptionId ?? null,
        slotLabel: component.slotLabel ?? null,
        componentProductId: component.componentProductId,
        variationId: component.variationId ?? null,
        componentLabel: component.componentLabel ?? null,
        productName: component.productName,
        productKitchenName: component.productKitchenName ?? null,
        variationName: component.variationName ?? null,
        variationSelectionsSnapshot: component.variationSelectionsSnapshot ?? [],
        modifiersSnapshot: component.modifiersSnapshot ?? [],
        quantity: component.quantity ?? 1,
        modifiersSubtotalCents: component.modifiersSubtotalCents ?? 0,
        sortOrder: component.sortOrder ?? 0,
        createdAt: component.createdAt ?? null,
        updatedAt: component.updatedAt ?? null,
      })),
    modifiers: [...preparedOrderItem.modifiers]
      .sort((left, right) => {
        const leftSortOrder = left.sortOrder ?? 0;
        const rightSortOrder = right.sortOrder ?? 0;

        if (leftSortOrder !== rightSortOrder) {
          return leftSortOrder - rightSortOrder;
        }

        return left.id.localeCompare(right.id);
      })
      .map((modifier) => ({
        id: modifier.id,
        modifierId: modifier.modifierId,
        modifierOptionId: modifier.modifierOptionId,
        modifierName: modifier.modifierName,
        modifierOptionName: modifier.modifierOptionName,
        quantity: modifier.quantity ?? 1,
        unitPriceCents: modifier.unitPriceCents ?? 0,
        totalPriceCents: modifier.totalPriceCents ?? 0,
        sortOrder: modifier.sortOrder ?? 0,
        createdAt: modifier.createdAt ?? null,
        updatedAt: modifier.updatedAt ?? null,
      })),
    taxes: [...preparedOrderItem.taxes]
      .sort((left, right) => {
        if (left.taxName !== right.taxName) {
          return left.taxName.localeCompare(right.taxName);
        }

        return left.taxId.localeCompare(right.taxId);
      })
      .map((tax) => ({
        taxId: tax.taxId,
        taxName: tax.taxName,
        taxRate: tax.taxRate,
        taxAmountCents: tax.taxAmountCents,
        createdAt: tax.createdAt ?? null,
        updatedAt: tax.updatedAt ?? null,
      })),
  }));
}

function countRequestedManualFreeUnits(input: NormalizedCreateOrderParams): number {
  return input.items.reduce((total, item) => {
    if (item.clientItemId === null) {
      return total;
    }

    return total + Math.max(0, Math.trunc(item.redeemFreeUnits));
  }, 0);
}

function countAppliedPromotionFreeUnits(promotion: OrderPromotionResponse | null): number {
  return (
    promotion?.appliedItems.reduce(
      (total, appliedItem) => total + Math.max(0, Math.trunc(appliedItem.freeUnits)),
      0,
    ) ?? 0
  );
}

function validateManualRedemptionWasApplied({
  input,
  promotion,
}: {
  input: NormalizedCreateOrderParams;
  promotion: OrderPromotionResponse | null;
}) {
  const requestedFreeUnits = countRequestedManualFreeUnits(input);
  if (requestedFreeUnits <= 0) {
    return;
  }

  const appliedFreeUnits = countAppliedPromotionFreeUnits(promotion);
  if (appliedFreeUnits >= requestedFreeUnits) {
    return;
  }

  throw validation(
    "order.manualPromotion.redemptionNotApplied",
    "The requested free drink could not be applied to this order",
  );
}

export async function prepareOrderPayload(
  fastify: FastifyInstance,
  normalizedInput: NormalizedCreateOrderParams,
): Promise<PreparedOrderPayload> {
  await validateOrderContext(fastify, normalizedInput);

  const validationContext = await buildOrderValidationContext(
    fastify,
    normalizedInput.organizationId,
    normalizedInput.items,
  );

  return validateAndPrepareOrderPayload(normalizedInput.items, validationContext, {
    enforceModifierMinSelect: true,
  });
}

async function validateOrderContext(
  fastify: FastifyInstance,
  normalizedInput: NormalizedCreateOrderParams,
): Promise<void> {
  const validations = [validateOrderOrganization(fastify, normalizedInput.organizationId)];
  if (normalizedInput.customerId) {
    validations.push(validateOrderCustomer(fastify, normalizedInput.customerId));
  }
  await Promise.all(validations);
}

function buildPromotionStateSnapshot(state: OrderPromotionState): OrderPromotionResponse {
  const seen = new Set<string>();
  const candidateProductIds = [...state.candidateProductIds]
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .filter((value) => {
      if (seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
  const progressCount = Math.max(0, Math.min(state.progressCount, 4));
  const legacyFreeDrinkPending = Boolean(
    state.legacyFreeDrinkGrantedAt && !state.legacyFreeDrinkRedeemedAt,
  );

  return {
    code: ORDER_PROMOTION_CODE,
    discountCents: 0,
    progress: {
      progressCount: legacyFreeDrinkPending ? 0 : progressCount,
      candidateProductIds: legacyFreeDrinkPending ? [] : candidateProductIds,
      eligibleForFreeDrink: legacyFreeDrinkPending || progressCount === 4,
      legacyFreeDrinkPending,
      rewardMode: legacyFreeDrinkPending ? "legacy" : progressCount === 4 ? "standard" : null,
    },
    appliedItems: [],
  };
}

function resolveCouponPeriodContext(
  coupon: CouponWithRules | null,
  now: Date,
): {
  periodType: "day" | "week" | "month" | null;
  periodStartDate: string | null;
} {
  if (!coupon?.periodLimitType || !coupon.periodLimitCount) {
    return {
      periodType: null,
      periodStartDate: null,
    };
  }

  return {
    periodType: coupon.periodLimitType,
    periodStartDate: resolveCouponPeriodStartDate({
      periodType: coupon.periodLimitType,
      now,
    }),
  };
}

async function validateCouponLimitsForPreview({
  fastify,
  coupon,
  customerId,
  periodType,
  periodStartDate,
}: {
  fastify: FastifyInstance;
  coupon: CouponWithRules;
  customerId: string | null;
  periodType: "day" | "week" | "month" | null;
  periodStartDate: string | null;
}) {
  if (coupon.maxRedemptionsPerCustomer !== null && coupon.maxRedemptionsPerCustomer > 0) {
    if (!customerId) {
      throw validation(
        "coupon.customerRequired",
        "This coupon requires a customerId to enforce per-customer limits",
      );
    }

    const [customerUsage] = await fastify.db
      .select({ total: sql<number>`count(*)::int` })
      .from(couponRedemptionsDB)
      .where(
        and(
          eq(couponRedemptionsDB.couponId, coupon.id),
          eq(couponRedemptionsDB.customerId, customerId),
        ),
      );

    if ((customerUsage?.total ?? 0) >= coupon.maxRedemptionsPerCustomer) {
      throw validation("coupon.customerLimitReached", "Coupon customer redemption limit reached");
    }
  }

  if (periodType && periodStartDate && coupon.periodLimitCount) {
    const [periodUsage] = await fastify.db
      .select({ usageCount: couponPeriodUsagesDB.usageCount })
      .from(couponPeriodUsagesDB)
      .where(
        and(
          eq(couponPeriodUsagesDB.couponId, coupon.id),
          eq(couponPeriodUsagesDB.organizationId, coupon.organizationId),
          eq(couponPeriodUsagesDB.periodType, periodType),
          eq(couponPeriodUsagesDB.periodStartDate, periodStartDate),
        ),
      );

    if ((periodUsage?.usageCount ?? 0) >= coupon.periodLimitCount) {
      throw validation("coupon.periodLimitReached", "Coupon period usage limit reached");
    }
  }
}

async function validateCouponLimitsForCreate({
  tx,
  coupon,
  customerId,
  periodType,
  periodStartDate,
}: {
  tx: TransactionDb;
  coupon: CouponWithRules;
  customerId: string | null;
  periodType: "day" | "week" | "month" | null;
  periodStartDate: string | null;
}) {
  if (coupon.maxRedemptionsPerCustomer !== null && coupon.maxRedemptionsPerCustomer > 0) {
    if (!customerId) {
      throw validation(
        "coupon.customerRequired",
        "This coupon requires a customerId to enforce per-customer limits",
      );
    }

    const lockKey = buildCouponCustomerLockKey(coupon.id, customerId);
    await tx.execute(sql`select pg_advisory_xact_lock(${lockKey})`);

    const customerRedemptionResult = await tx.execute(sql`
      select count(*)::int as "total"
      from coupon_redemption
      where coupon_id = ${coupon.id}
        and customer_id = ${customerId}
    `);
    const customerRedemptionRow = customerRedemptionResult.rows[0];
    const totalCustomerRedemptions = Number(customerRedemptionRow?.total ?? 0);

    if (totalCustomerRedemptions >= coupon.maxRedemptionsPerCustomer) {
      throw validation("coupon.customerLimitReached", "Coupon customer redemption limit reached");
    }
  }

  if (periodType && periodStartDate && coupon.periodLimitCount) {
    const periodUsageResult = await tx.execute(sql`
      select usage_count as "usageCount"
      from coupon_period_usage
      where coupon_id = ${coupon.id}
        and organization_id = ${coupon.organizationId}
        and period_type = ${periodType}
        and period_start_date = ${periodStartDate}
      for update
    `);

    const periodUsageRow = periodUsageResult.rows[0];
    const usageCount = Number(periodUsageRow?.usageCount ?? 0);

    if (usageCount >= coupon.periodLimitCount) {
      throw validation("coupon.periodLimitReached", "Coupon period usage limit reached");
    }
  }
}

function calculatePreparedOrder({
  preparedPayload,
  input,
  promotionState,
  coupon,
  couponPeriodContext,
  cashbackBalanceCents,
  now,
  options,
}: {
  preparedPayload: PreparedOrderPayload;
  input: NormalizedCreateOrderParams;
  promotionState: OrderPromotionState | null;
  coupon: CouponWithRules | null;
  couponPeriodContext: {
    periodType: "day" | "week" | "month" | null;
    periodStartDate: string | null;
  };
  cashbackBalanceCents: number | null;
  now: Date;
  options?: OrderCalculationOptions;
}): CalculatedOrderPayload {
  const workingPreparedPayload = clonePreparedPayload(preparedPayload);
  const hasManualRedemptionMode = input.items.some((item) => item.clientItemId !== null);
  const promotionResult = promotionState
    ? applyBuy4Get1Promotion({
        preparedPayload: workingPreparedPayload,
        state: promotionState,
        options: {
          manualRedemption: hasManualRedemptionMode,
          splitMixedLines: hasManualRedemptionMode,
        },
      })
    : null;

  let effectivePayload = promotionResult?.payload ?? workingPreparedPayload;
  let couponResult: OrderCouponResponse | null = null;

  if (coupon) {
    validateCouponWindow(coupon, now);
    validateCouponPromotionCompatibility({
      coupon,
      promotion: promotionResult?.promotion ?? null,
    });

    const evaluatedCoupon = applyCouponToPreparedOrder({
      preparedPayload: effectivePayload,
      coupon,
    });

    effectivePayload = evaluatedCoupon.payload;
    couponResult = evaluatedCoupon.coupon;
  }

  const tipCents = calculateTipCents(input.tip, effectivePayload.grandTotalCents);
  const grandTotalCents = effectivePayload.grandTotalCents + tipCents;
  const cashbackAmounts = calculateCashbackAmounts({
    payload: effectivePayload,
    customerId: input.customerId,
    requestedRedemptionCents: input.cashbackRedeemCents,
    cashbackBalanceCents,
    orderGrandTotalCents: grandTotalCents,
    allowCashbackRedemption: options?.allowCashbackRedemption ?? false,
  });

  return {
    payload: effectivePayload,
    promotion: promotionResult?.promotion ?? null,
    coupon: couponResult,
    couponConsumption:
      coupon && couponResult
        ? {
            couponId: coupon.id,
            couponCode: coupon.code,
            periodType: couponPeriodContext.periodType,
            periodStartDate: couponPeriodContext.periodStartDate,
          }
        : null,
    nextPromotionState: promotionResult?.nextState ?? null,
    tipCents,
    grandTotalCents,
    amountDueCents: cashbackAmounts.amountDueCents,
    cashbackBalanceCents:
      options?.exposeCashbackBalance && input.customerId ? cashbackBalanceCents : null,
    cashbackRedemptionCents: cashbackAmounts.cashbackRedemptionCents,
    cashbackEarnedCents: cashbackAmounts.cashbackEarnedCents,
    cashbackEligiblePaidCents: cashbackAmounts.cashbackEligiblePaidCents,
  };
}

export async function previewOrder(
  fastify: FastifyInstance,
  input: CreateOrderParams,
  options: OrderCalculationOptions = {},
): Promise<OrderPreviewResponse> {
  const normalizedInput = normalizeCreateOrderInput(input);
  await validateOrderContext(fastify, normalizedInput);

  const now = new Date();
  const coupon = normalizedInput.couponCode
    ? await loadCouponByCode({
        fastify,
        organizationId: normalizedInput.organizationId,
        couponCode: normalizedInput.couponCode,
      })
    : null;

  if (coupon) {
    validateCouponWindow(coupon, now);
  }

  const couponPeriodContext = resolveCouponPeriodContext(coupon, now);
  if (coupon) {
    await validateCouponLimitsForPreview({
      fastify,
      coupon,
      customerId: normalizedInput.customerId,
      periodType: couponPeriodContext.periodType,
      periodStartDate: couponPeriodContext.periodStartDate,
    });
  }

  const promotionState = normalizedInput.customerId
    ? ((await loadCustomerPromotionState(fastify, normalizedInput.customerId)) ?? {
        progressCount: 0,
        candidateProductIds: [],
        legacyFreeDrinkGrantedAt: null,
        legacyFreeDrinkRedeemedAt: null,
      })
    : null;
  const cashbackAccount = normalizedInput.customerId
    ? await loadCustomerCashbackAccount(fastify, normalizedInput.customerId)
    : null;

  if (normalizedInput.items.length === 0) {
    const cashbackAmounts = calculateCashbackAmounts({
      payload: {
        items: [],
        subtotalCents: 0,
        taxesCents: 0,
        grandTotalCents: 0,
      },
      customerId: normalizedInput.customerId,
      requestedRedemptionCents: normalizedInput.cashbackRedeemCents,
      cashbackBalanceCents: cashbackAccount?.balanceCents ?? null,
      orderGrandTotalCents: 0,
      allowCashbackRedemption: options.allowCashbackRedemption ?? false,
    });

    return {
      tipType: normalizedInput.tip.type,
      tipRateBps: normalizedInput.tip.rateBps,
      tipCents: 0,
      promotionDiscountCents: 0,
      couponDiscountCents: 0,
      cashbackBalanceCents:
        options.exposeCashbackBalance && normalizedInput.customerId
          ? (cashbackAccount?.balanceCents ?? 0)
          : null,
      cashbackRedemptionCents: cashbackAmounts.cashbackRedemptionCents,
      cashbackEarnedCents: cashbackAmounts.cashbackEarnedCents,
      cashbackEligiblePaidCents: cashbackAmounts.cashbackEligiblePaidCents,
      subtotalCents: 0,
      taxesCents: 0,
      grandTotalCents: 0,
      amountDueCents: cashbackAmounts.amountDueCents,
      items: [],
      promotion: promotionState ? buildPromotionStateSnapshot(promotionState) : null,
      coupon: null,
    };
  }

  const preparedOrderPayload = await prepareOrderPayload(fastify, normalizedInput);

  const calculatedOrder = calculatePreparedOrder({
    preparedPayload: preparedOrderPayload,
    input: normalizedInput,
    promotionState,
    coupon,
    couponPeriodContext,
    cashbackBalanceCents: cashbackAccount?.balanceCents ?? null,
    now,
    options,
  });

  validateManualRedemptionWasApplied({
    input: normalizedInput,
    promotion: calculatedOrder.promotion,
  });

  return {
    tipType: normalizedInput.tip.type,
    tipRateBps: normalizedInput.tip.rateBps,
    tipCents: calculatedOrder.tipCents,
    promotionDiscountCents: calculatedOrder.promotion?.discountCents ?? 0,
    couponDiscountCents: calculatedOrder.coupon?.discountCents ?? 0,
    cashbackBalanceCents: calculatedOrder.cashbackBalanceCents,
    cashbackRedemptionCents: calculatedOrder.cashbackRedemptionCents,
    cashbackEarnedCents: calculatedOrder.cashbackEarnedCents,
    cashbackEligiblePaidCents: calculatedOrder.cashbackEligiblePaidCents,
    subtotalCents: calculatedOrder.payload.subtotalCents,
    taxesCents: calculatedOrder.payload.taxesCents,
    grandTotalCents: calculatedOrder.grandTotalCents,
    amountDueCents: calculatedOrder.amountDueCents,
    items: mapPreparedPayloadItemsToResponse(calculatedOrder.payload),
    promotion: calculatedOrder.promotion,
    coupon: calculatedOrder.coupon,
  };
}

export async function createOrderPaymentAttempt(
  fastify: FastifyInstance,
  input: CreateOrderPaymentAttemptParams,
): Promise<OrderPaymentAttemptResponse> {
  const normalizedCurrency = (input.currency ?? "MXN").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
    throw validation("order.paymentAttempt.currencyInvalid", "Payment currency must be ISO-4217");
  }

  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw validation("order.paymentAttempt.amountInvalid", "Payment amount must be positive");
  }

  const preview = await previewOrder(fastify, input);
  if (preview.amountDueCents !== input.amountCents) {
    throw validation(
      "order.paymentAttempt.amountMismatch",
      "Payment amount does not match order total",
      {
        expectedAmountCents: preview.amountDueCents,
        receivedAmountCents: input.amountCents,
      },
    );
  }

  const paymentAttemptId = generateNanoId();
  const reference = `tk-${paymentAttemptId}`;
  const normalizedInput = normalizeCreateOrderInput(input);
  const preparedPayload = await prepareOrderPayload(fastify, normalizedInput);
  const scheduledFor =
    normalizedInput.preparationDelayMinutes > 0
      ? new Date(Date.now() + normalizedInput.preparationDelayMinutes * 60_000)
      : null;
  const paymentAttempt = await fastify.db.transaction(async (tx) => {
    const [created] = await tx
      .insert(orderPaymentAttemptsDB)
      .values({
        id: paymentAttemptId,
        organizationId: input.organizationId,
        customerId: normalizedInput.customerId,
        provider: "zettle",
        reference,
        amountCents: input.amountCents,
        currency: normalizedCurrency,
        status: "pending",
        orderPayload: {
          organizationId: normalizedInput.organizationId,
          customerId: normalizedInput.customerId,
          customerName: normalizedInput.customerName,
          couponCode: normalizedInput.couponCode,
          cashbackRedeemCents: normalizedInput.cashbackRedeemCents,
          preparationDelayMinutes: normalizedInput.preparationDelayMinutes,
          comment: normalizedInput.comment,
          tip: normalizedInput.tip,
          items: normalizedInput.items,
        },
      })
      .returning();
    if (!created) return null;
    await reserveCheckoutInventory(tx, {
      organizationId: normalizedInput.organizationId,
      paymentAttemptId,
      payload: preparedPayload,
      scheduledFor,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
    return created;
  });

  if (!paymentAttempt) {
    throw new Error("Failed to create order payment attempt");
  }

  return normalizePaymentAttemptResponse(paymentAttempt);
}

export async function recordOrderPaymentAttemptResult(
  fastify: FastifyInstance,
  input: RecordOrderPaymentAttemptResultParams,
): Promise<OrderPaymentAttemptResponse> {
  const currentAttempt = await loadPaymentAttempt(fastify, input.paymentAttemptId);

  if (currentAttempt.status === "completed") {
    return currentAttempt;
  }

  if (input.amountCents != null && input.amountCents !== currentAttempt.amountCents) {
    throw validation(
      "order.paymentAttempt.amountMismatch",
      "Paid amount does not match attempt amount",
      {
        expectedAmountCents: currentAttempt.amountCents,
        receivedAmountCents: input.amountCents,
      },
    );
  }

  const nextStatus =
    input.status === "paid"
      ? "paid_unlinked"
      : input.status === "cancelled"
        ? "cancelled"
        : "failed";

  if (
    currentAttempt.status !== "pending" &&
    !(currentAttempt.status === "paid_unlinked" && nextStatus === "paid_unlinked")
  ) {
    throw conflict(
      "order.paymentAttempt.statusConflict",
      "Payment attempt result cannot be changed from its current status",
      { status: currentAttempt.status },
    );
  }

  const [updatedAttempt] = await fastify.db
    .update(orderPaymentAttemptsDB)
    .set({
      status: nextStatus,
      transactionId: input.transactionId ?? currentAttempt.transactionId,
      referenceNumber: input.referenceNumber ?? currentAttempt.referenceNumber,
      cardBrand: input.cardBrand ?? currentAttempt.cardBrand,
      entryMode: input.entryMode ?? currentAttempt.entryMode,
      authorizationCode: input.authorizationCode ?? currentAttempt.authorizationCode,
      obfuscatedPan: input.obfuscatedPan ?? currentAttempt.obfuscatedPan,
      rawResponse: input.rawResponse ?? currentAttempt.rawResponse,
      failureCode: input.failureCode ?? currentAttempt.failureCode,
      failureMessage: input.failureMessage ?? currentAttempt.failureMessage,
      updatedAt: sql`now()`,
    })
    .where(eq(orderPaymentAttemptsDB.id, input.paymentAttemptId))
    .returning();

  if (!updatedAttempt) {
    throw notFound("order.paymentAttempt.notFound", "The payment attempt was not found");
  }

  if (nextStatus === "cancelled" || nextStatus === "failed") {
    await fastify.db.transaction(async (tx) => {
      await releaseCheckoutInventory(tx, updatedAttempt.id);
    });
  }

  return normalizePaymentAttemptResponse(updatedAttempt);
}

export async function createOrder(
  fastify: FastifyInstance,
  input: CreateOrderParams,
  options: CreateOrderOptions = {},
): Promise<OrderResponse> {
  const normalizedInput = normalizeCreateOrderInput(input);

  if (normalizedInput.paymentAttemptId) {
    const existingPaymentAttempt = await loadPaymentAttempt(
      fastify,
      normalizedInput.paymentAttemptId,
    );
    if (existingPaymentAttempt.status === "completed" && existingPaymentAttempt.orderId) {
      const existingOrder = await loadOrder(fastify, existingPaymentAttempt.orderId, true);
      if (existingOrder) {
        return existingOrder;
      }
    }
  }

  const preparedOrderPayload = await prepareOrderPayload(fastify, normalizedInput);

  const now = new Date();
  const coupon = normalizedInput.couponCode
    ? await loadCouponByCode({
        fastify,
        organizationId: normalizedInput.organizationId,
        couponCode: normalizedInput.couponCode,
      })
    : null;

  if (coupon) {
    validateCouponWindow(coupon, now);
  }

  const couponPeriodContext = resolveCouponPeriodContext(coupon, now);

  let createdOrderId: string | null = null;
  let orderPromotion: OrderPromotionResponse | null = null;
  let orderCoupon: OrderCouponResponse | null = null;
  let createdOrderItemResponseMetadata = new Map<string, OrderItemResponseMetadata>();

  for (let attempt = 0; attempt < MAX_FOLIO_RETRY_ATTEMPTS; attempt += 1) {
    try {
      createdOrderId = await fastify.db.transaction(async (tx) => {
        const folioPrefix = buildOrderFolioPrefix(now);
        const [nextFolioRow] = await tx
          .select({
            nextSequence: sql<number>`coalesce(max(substring(${ordersDB.folio} from 7)::integer), 0) + 1`,
          })
          .from(ordersDB)
          .where(
            and(
              eq(ordersDB.organizationId, normalizedInput.organizationId),
              sql`${ordersDB.folio} like ${`${folioPrefix}-%`}`,
            ),
          );

        const nextSequence = nextFolioRow?.nextSequence ?? 1;

        if (nextSequence > FOLIO_MAX_SEQUENCE) {
          throw validation(
            "order.folioLimitReached",
            `Folio limit reached for period ${folioPrefix}`,
          );
        }

        if (coupon) {
          await validateCouponLimitsForCreate({
            tx,
            coupon,
            customerId: normalizedInput.customerId,
            periodType: couponPeriodContext.periodType,
            periodStartDate: couponPeriodContext.periodStartDate,
          });
        }

        const paymentAttempt = normalizedInput.paymentAttemptId
          ? await lockPaymentAttempt(tx, normalizedInput.paymentAttemptId)
          : null;

        if (normalizedInput.paymentAttemptId && !paymentAttempt) {
          throw notFound("order.paymentAttempt.notFound", "The payment attempt was not found");
        }

        if (paymentAttempt?.status === "completed" && paymentAttempt.orderId) {
          return paymentAttempt.orderId;
        }

        if (paymentAttempt) {
          if (paymentAttempt.organizationId !== normalizedInput.organizationId) {
            throw validation(
              "order.paymentAttempt.organizationMismatch",
              "Payment attempt does not belong to this organization",
            );
          }

          if (paymentAttempt.status !== "paid_unlinked") {
            throw validation(
              "order.paymentAttempt.notPaid",
              "Payment attempt must be paid before creating the order",
              { status: paymentAttempt.status },
            );
          }
        }

        const promotionState = normalizedInput.customerId
          ? ((await lockCustomerPromotionState(tx, normalizedInput.customerId)) ?? {
              progressCount: 0,
              candidateProductIds: [],
              legacyFreeDrinkGrantedAt: null,
              legacyFreeDrinkRedeemedAt: null,
            })
          : null;
        const cashbackAccount = normalizedInput.customerId
          ? await lockCustomerCashbackAccount(tx, normalizedInput.customerId)
          : null;

        const calculatedOrder = calculatePreparedOrder({
          preparedPayload: preparedOrderPayload,
          input: normalizedInput,
          promotionState,
          coupon,
          couponPeriodContext,
          cashbackBalanceCents: cashbackAccount?.balanceCents ?? null,
          now,
          options,
        });

        validateManualRedemptionWasApplied({
          input: normalizedInput,
          promotion: calculatedOrder.promotion,
        });

        if (
          options.requirePaymentForPositiveAmountDue &&
          calculatedOrder.amountDueCents > 0 &&
          !paymentAttempt
        ) {
          throw validation(
            "order.paymentAttempt.required",
            "A paid payment attempt is required for orders with amount due",
            {
              amountDueCents: calculatedOrder.amountDueCents,
            },
          );
        }

        if (paymentAttempt && paymentAttempt.amountCents !== calculatedOrder.amountDueCents) {
          throw validation(
            "order.paymentAttempt.amountMismatch",
            "Paid amount does not match recalculated order total",
            {
              paidAmountCents: paymentAttempt.amountCents,
              orderTotalCents: calculatedOrder.amountDueCents,
            },
          );
        }

        orderPromotion = calculatedOrder.promotion;
        orderCoupon = calculatedOrder.coupon;
        createdOrderItemResponseMetadata = new Map(
          calculatedOrder.payload.items.map((preparedOrderItem) => [
            preparedOrderItem.item.id,
            {
              sourceClientItemId: preparedOrderItem.sourceClientItemId,
              lineType: preparedOrderItem.lineType,
              displayUnitPriceCents: preparedOrderItem.displayUnitPriceCents,
            },
          ]),
        );

        const orderId = generateNanoId();
        const folio = formatOrderFolio(folioPrefix, nextSequence);
        const scheduledFor =
          normalizedInput.preparationDelayMinutes > 0
            ? new Date(now.getTime() + normalizedInput.preparationDelayMinutes * 60_000)
            : null;
        const customerDisplayName =
          normalizedInput.customerName ??
          (await loadWorkOrderCustomerDisplayName(tx, normalizedInput.customerId));

        const [createdOrder] = await tx
          .insert(ordersDB)
          .values({
            id: orderId,
            organizationId: normalizedInput.organizationId,
            customerId: normalizedInput.customerId,
            couponId: calculatedOrder.couponConsumption?.couponId ?? null,
            couponCode: calculatedOrder.couponConsumption?.couponCode ?? null,
            source: options.source ?? "unknown",
            folio,
            comment: normalizedInput.comment,
            scheduledFor,
            tipType: normalizedInput.tip.type,
            tipRateBps: normalizedInput.tip.rateBps,
            tipCents: calculatedOrder.tipCents,
            promotionDiscountCents: calculatedOrder.promotion?.discountCents ?? 0,
            couponDiscountCents: calculatedOrder.coupon?.discountCents ?? 0,
            cashbackRedemptionCents: calculatedOrder.cashbackRedemptionCents,
            cashbackEarnedCents: calculatedOrder.cashbackEarnedCents,
            cashbackEligiblePaidCents: calculatedOrder.cashbackEligiblePaidCents,
            subtotalCents: calculatedOrder.payload.subtotalCents,
            taxesCents: calculatedOrder.payload.taxesCents,
            grandTotalCents: calculatedOrder.grandTotalCents,
            amountDueCents: calculatedOrder.amountDueCents,
          })
          .returning({
            id: ordersDB.id,
          });

        if (!createdOrder) {
          throw new Error("Failed to create order");
        }

        const orderItemsToInsert = calculatedOrder.payload.items.map((preparedOrderItem) => ({
          ...preparedOrderItem.item,
          orderId,
        }));

        const orderItemModifiersToInsert = calculatedOrder.payload.items.flatMap(
          (preparedOrderItem) => preparedOrderItem.modifiers,
        );
        const orderItemCompoundComponentsToInsert = calculatedOrder.payload.items.flatMap(
          (preparedOrderItem) => preparedOrderItem.compoundComponents,
        );
        const orderItemTaxesToInsert = calculatedOrder.payload.items.flatMap(
          (preparedOrderItem) => preparedOrderItem.taxes,
        );

        if (orderItemsToInsert.length > 0) {
          await tx.insert(orderItemsDB).values(orderItemsToInsert);
        }

        if (orderItemModifiersToInsert.length > 0) {
          await tx.insert(orderItemModifiersDB).values(orderItemModifiersToInsert);
        }

        if (orderItemCompoundComponentsToInsert.length > 0) {
          await tx
            .insert(orderItemCompoundComponentsDB)
            .values(orderItemCompoundComponentsToInsert);
        }

        if (orderItemTaxesToInsert.length > 0) {
          await tx.insert(orderItemTaxesDB).values(orderItemTaxesToInsert);
        }

        const workOrdersToInsert = buildWorkOrderRows({
          payload: calculatedOrder.payload,
          organizationId: normalizedInput.organizationId,
          orderId,
          orderFolio: folio,
          customerDisplayName,
          orderComment: normalizedInput.comment,
          scheduledFor,
        });

        const inventoryPlan = await prepareOrderInventory(tx, {
          organizationId: normalizedInput.organizationId,
          payload: calculatedOrder.payload,
          workOrders: workOrdersToInsert,
        });

        if (inventoryPlan.workOrders.length > 0) {
          await tx.insert(workOrdersDB).values(inventoryPlan.workOrders);

          for (const workOrder of inventoryPlan.workOrders) {
            await notifyWorkOrderCreated(tx, workOrder);
          }
        }

        await reserveOrderInventory(tx, {
          plan: inventoryPlan,
          orderId,
          scheduledFor,
          paymentAttemptId: normalizedInput.paymentAttemptId,
        });

        if (normalizedInput.customerId && calculatedOrder.nextPromotionState) {
          await tx
            .insert(customerOrderPromotionStatesDB)
            .values({
              customerId: normalizedInput.customerId,
              progressCount: calculatedOrder.nextPromotionState.progressCount,
              candidateProductIds: calculatedOrder.nextPromotionState.candidateProductIds,
              legacyFreeDrinkGrantedAt:
                calculatedOrder.nextPromotionState.legacyFreeDrinkGrantedAt ?? null,
              legacyFreeDrinkRedeemedAt:
                calculatedOrder.nextPromotionState.legacyFreeDrinkRedeemedAt ?? null,
              version: 1,
            })
            .onConflictDoUpdate({
              target: customerOrderPromotionStatesDB.customerId,
              set: {
                progressCount: calculatedOrder.nextPromotionState.progressCount,
                candidateProductIds: calculatedOrder.nextPromotionState.candidateProductIds,
                legacyFreeDrinkGrantedAt:
                  calculatedOrder.nextPromotionState.legacyFreeDrinkGrantedAt ?? null,
                legacyFreeDrinkRedeemedAt:
                  calculatedOrder.nextPromotionState.legacyFreeDrinkRedeemedAt ?? null,
                version: sql`${customerOrderPromotionStatesDB.version} + 1`,
                updatedAt: sql`now()`,
              },
            });
        }

        if (calculatedOrder.couponConsumption && calculatedOrder.coupon) {
          await tx.insert(couponRedemptionsDB).values({
            id: generateNanoId(),
            couponId: calculatedOrder.couponConsumption.couponId,
            orderId,
            organizationId: normalizedInput.organizationId,
            customerId: normalizedInput.customerId,
            codeSnapshot: calculatedOrder.couponConsumption.couponCode,
            discountCents: calculatedOrder.coupon.discountCents,
            periodType: calculatedOrder.couponConsumption.periodType,
            periodStartDate: calculatedOrder.couponConsumption.periodStartDate,
          });

          if (
            calculatedOrder.couponConsumption.periodType &&
            calculatedOrder.couponConsumption.periodStartDate
          ) {
            await tx
              .insert(couponPeriodUsagesDB)
              .values({
                couponId: calculatedOrder.couponConsumption.couponId,
                organizationId: normalizedInput.organizationId,
                periodType: calculatedOrder.couponConsumption.periodType,
                periodStartDate: calculatedOrder.couponConsumption.periodStartDate,
                usageCount: 1,
              })
              .onConflictDoUpdate({
                target: [
                  couponPeriodUsagesDB.couponId,
                  couponPeriodUsagesDB.organizationId,
                  couponPeriodUsagesDB.periodType,
                  couponPeriodUsagesDB.periodStartDate,
                ],
                set: {
                  usageCount: sql`${couponPeriodUsagesDB.usageCount} + 1`,
                  updatedAt: sql`now()`,
                },
              });
          }
        }

        if (normalizedInput.customerId && cashbackAccount) {
          let nextCashbackBalance = cashbackAccount.balanceCents;

          if (calculatedOrder.cashbackRedemptionCents > 0) {
            nextCashbackBalance -= calculatedOrder.cashbackRedemptionCents;

            await tx
              .update(customerCashbackAccountsDB)
              .set({
                balanceCents: nextCashbackBalance,
                totalRedeemedCents: sql`${customerCashbackAccountsDB.totalRedeemedCents} + ${calculatedOrder.cashbackRedemptionCents}`,
                version: sql`${customerCashbackAccountsDB.version} + 1`,
                updatedAt: sql`now()`,
              })
              .where(eq(customerCashbackAccountsDB.customerId, normalizedInput.customerId));

            await tx.insert(customerCashbackLedgerDB).values({
              id: generateNanoId(),
              customerId: normalizedInput.customerId,
              orderId,
              organizationId: normalizedInput.organizationId,
              movementType: "redeemed",
              amountCents: calculatedOrder.cashbackRedemptionCents,
              balanceAfterCents: nextCashbackBalance,
            });
          }

          if (calculatedOrder.cashbackEarnedCents > 0) {
            nextCashbackBalance += calculatedOrder.cashbackEarnedCents;

            await tx
              .update(customerCashbackAccountsDB)
              .set({
                balanceCents: nextCashbackBalance,
                totalEarnedCents: sql`${customerCashbackAccountsDB.totalEarnedCents} + ${calculatedOrder.cashbackEarnedCents}`,
                version: sql`${customerCashbackAccountsDB.version} + 1`,
                updatedAt: sql`now()`,
              })
              .where(eq(customerCashbackAccountsDB.customerId, normalizedInput.customerId));

            await tx.insert(customerCashbackLedgerDB).values({
              id: generateNanoId(),
              customerId: normalizedInput.customerId,
              orderId,
              organizationId: normalizedInput.organizationId,
              movementType: "earned",
              amountCents: calculatedOrder.cashbackEarnedCents,
              balanceAfterCents: nextCashbackBalance,
            });
          }
        }

        if (paymentAttempt) {
          await tx
            .update(orderPaymentAttemptsDB)
            .set({
              orderId,
              status: "completed",
              updatedAt: sql`now()`,
            })
            .where(eq(orderPaymentAttemptsDB.id, paymentAttempt.id));
        }

        return createdOrder.id;
      });

      break;
    } catch (error) {
      const pgError = getPgError(error);
      const isFolioConflict =
        pgError?.code === "23505" && pgError.constraint === ORDER_FOLIO_UNIQUE_CONSTRAINT;
      const isCouponRedemptionConflict =
        pgError?.code === "23505" &&
        pgError.constraint === COUPON_REDEMPTION_UNIQUE_ORDER_CONSTRAINT;

      if (isFolioConflict && attempt < MAX_FOLIO_RETRY_ATTEMPTS - 1) {
        continue;
      }

      if (isFolioConflict) {
        throw conflict("order.folioConflict", "Failed to generate a unique folio for the order");
      }

      if (isCouponRedemptionConflict) {
        throw conflict("coupon.redemptionConflict", "Coupon redemption could not be persisted");
      }

      await markPaymentAttemptRequiresReconciliation(
        fastify,
        normalizedInput.paymentAttemptId,
        error,
      );
      throw error;
    }
  }

  if (!createdOrderId) {
    throw new Error("Failed to create order");
  }

  const createdOrder = await loadOrder(fastify, createdOrderId);

  if (!createdOrder) {
    throw new Error("Failed to retrieve created order");
  }

  createdOrder.promotion = orderPromotion;
  createdOrder.coupon = orderCoupon;
  createdOrder.items = createdOrder.items.map((item) => {
    const metadata = createdOrderItemResponseMetadata.get(item.id);
    return {
      ...item,
      sourceClientItemId: metadata?.sourceClientItemId ?? null,
      lineType: metadata?.lineType ?? "paid",
      displayUnitPriceCents: metadata?.displayUnitPriceCents ?? item.unitPriceCents,
    };
  });

  return createdOrder;
}
