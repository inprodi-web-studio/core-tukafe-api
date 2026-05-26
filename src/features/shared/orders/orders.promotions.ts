import type { PreparedOrderItem, PreparedOrderPayload } from "./orders.validators";
import type {
  OrderPromotionResponse,
  OrderPromotionState,
  OrderPreviewResponse,
  OrderResponse,
} from "./orders.types";

export const ORDER_PROMOTION_CODE = "BUY4_GET1";
const MAX_FREE_UNITS_PER_ORDER_MANUAL_MODE = 1;

function clampProgress(value: number): number {
  return Math.max(0, Math.min(value, 4));
}

function isWholeUnitQuantity(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function splitAmountByQuantity({
  total,
  quantity,
  splitQuantity,
}: {
  total: number;
  quantity: number;
  splitQuantity: number;
}): number {
  if (total <= 0 || quantity <= 0 || splitQuantity <= 0) {
    return 0;
  }

  return Math.round((total * splitQuantity) / quantity);
}

function normalizePromotionState(state?: OrderPromotionState | null): {
  progressCount: number;
  candidateProductIds: string[];
} {
  const seen = new Set<string>();
  const candidateProductIds = [...(state?.candidateProductIds ?? [])]
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .filter((value) => {
      if (seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });

  const progressCount = clampProgress(state?.progressCount ?? 0);

  return {
    progressCount,
    candidateProductIds,
  };
}

function clonePreparedItem(preparedOrderItem: PreparedOrderItem): PreparedOrderItem {
  return {
    ...preparedOrderItem,
    item: {
      ...preparedOrderItem.item,
    },
    modifiers: [...preparedOrderItem.modifiers],
    taxes: [...preparedOrderItem.taxes],
  };
}

function splitPreparedOrderItem({
  sourceItem,
  freeUnits,
  originalSubtotalCents,
  originalTaxesCents,
}: {
  sourceItem: PreparedOrderItem;
  freeUnits: number;
  originalSubtotalCents: number;
  originalTaxesCents: number;
}): PreparedOrderItem[] {
  const totalQuantity = sourceItem.item.quantity;

  if (!isWholeUnitQuantity(totalQuantity) || freeUnits <= 0 || freeUnits >= totalQuantity) {
    return [sourceItem];
  }

  const paidUnits = totalQuantity - freeUnits;
  const paidSubtotalCents = splitAmountByQuantity({
    total: originalSubtotalCents,
    quantity: totalQuantity,
    splitQuantity: paidUnits,
  });
  const paidTaxesCents = splitAmountByQuantity({
    total: originalTaxesCents,
    quantity: totalQuantity,
    splitQuantity: paidUnits,
  });
  const paidGrandTotalCents = paidSubtotalCents + paidTaxesCents;

  const freeSubtotalPreDiscountCents = originalSubtotalCents - paidSubtotalCents;
  const freeTaxesPreDiscountCents = originalTaxesCents - paidTaxesCents;
  const freeGrandTotalPreDiscountCents = freeSubtotalPreDiscountCents + freeTaxesPreDiscountCents;

  const paidLine: PreparedOrderItem = {
    ...clonePreparedItem(sourceItem),
    lineType: "paid",
    item: {
      ...sourceItem.item,
      id: `${sourceItem.item.id}_paid`,
      quantity: paidUnits,
      freeUnits: 0,
      promotionCode: null,
      promotionDiscountCents: 0,
      couponDiscountCents: 0,
      subtotalCents: paidSubtotalCents,
      taxesCents: paidTaxesCents,
      grandTotalCents: paidGrandTotalCents,
    },
  };

  const freeLine: PreparedOrderItem = {
    ...clonePreparedItem(sourceItem),
    lineType: "free",
    item: {
      ...sourceItem.item,
      id: `${sourceItem.item.id}_free`,
      quantity: freeUnits,
      freeUnits,
      promotionCode: ORDER_PROMOTION_CODE,
      promotionDiscountCents: freeGrandTotalPreDiscountCents,
      couponDiscountCents: 0,
      subtotalCents: 0,
      taxesCents: 0,
      grandTotalCents: 0,
    },
  };

  const paidOrderItemId = paidLine.item.id;
  const freeOrderItemId = freeLine.item.id;

  const paidModifiers = sourceItem.modifiers.map((modifier) => {
    const paidTotalPriceCents = splitAmountByQuantity({
      total: modifier.totalPriceCents ?? 0,
      quantity: totalQuantity,
      splitQuantity: paidUnits,
    });

    return {
      ...modifier,
      id: `${modifier.id}_paid`,
      orderItemId: paidOrderItemId,
      totalPriceCents: paidTotalPriceCents,
    };
  });
  const freeModifiers = sourceItem.modifiers.map((modifier) => ({
    ...modifier,
    id: `${modifier.id}_free`,
    orderItemId: freeOrderItemId,
    totalPriceCents: 0,
  }));

  paidLine.modifiers = paidModifiers;
  freeLine.modifiers = freeModifiers;
  paidLine.item.modifiersSubtotalCents = paidModifiers.reduce(
    (accumulator, modifier) => accumulator + modifier.totalPriceCents,
    0,
  );
  freeLine.item.modifiersSubtotalCents = 0;

  const paidTaxes = sourceItem.taxes.map((tax) => {
    const paidTaxAmountCents = splitAmountByQuantity({
      total: tax.taxAmountCents ?? 0,
      quantity: totalQuantity,
      splitQuantity: paidUnits,
    });

    return {
      ...tax,
      orderItemId: paidOrderItemId,
      taxAmountCents: paidTaxAmountCents,
    };
  });
  const freeTaxes = sourceItem.taxes.map((tax) => ({
    ...tax,
    orderItemId: freeOrderItemId,
    taxAmountCents: 0,
  }));

  paidLine.taxes = paidTaxes;
  freeLine.taxes = freeTaxes;
  paidLine.item.taxesCents = paidTaxes.reduce(
    (accumulator, tax) => accumulator + tax.taxAmountCents,
    0,
  );
  freeLine.item.taxesCents = 0;
  paidLine.item.grandTotalCents = paidLine.item.subtotalCents + paidLine.item.taxesCents;
  freeLine.item.grandTotalCents = 0;

  return [paidLine, freeLine];
}

export interface ApplyPromotionResult {
  payload: PreparedOrderPayload;
  promotion: OrderPromotionResponse;
  nextState: OrderPromotionState;
}

export interface ApplyPromotionOptions {
  manualRedemption: boolean;
  splitMixedLines?: boolean;
}

export function applyBuy4Get1Promotion({
  preparedPayload,
  state,
  options,
}: {
  preparedPayload: PreparedOrderPayload;
  state?: OrderPromotionState | null;
  options?: ApplyPromotionOptions;
}): ApplyPromotionResult {
  const normalizedState = normalizePromotionState(state);
  const manualRedemption = options?.manualRedemption ?? false;
  const splitMixedLines = options?.splitMixedLines ?? false;

  const itemCopies = preparedPayload.items.map(clonePreparedItem);
  if (manualRedemption) {
    itemCopies.sort((left, right) => {
      const leftRequestsRedemption = left.requestedRedeemFreeUnits > 0;
      const rightRequestsRedemption = right.requestedRedeemFreeUnits > 0;

      if (leftRequestsRedemption !== rightRequestsRedemption) {
        return leftRequestsRedemption ? 1 : -1;
      }

      return (left.item.sortOrder ?? 0) - (right.item.sortOrder ?? 0);
    });
  }

  const candidateProductIds = [...normalizedState.candidateProductIds];
  const candidateProductIdsSet = new Set(candidateProductIds);
  let progressCount = normalizedState.progressCount;
  let promotionDiscountCents = 0;
  let remainingManualFreeUnits = manualRedemption ? MAX_FREE_UNITS_PER_ORDER_MANUAL_MODE : null;

  const appliedItems: OrderPromotionResponse["appliedItems"] = [];
  const promotedItems: PreparedOrderItem[] = [];

  for (const preparedOrderItem of itemCopies) {
    const quantity = preparedOrderItem.item.quantity;

    if (!preparedOrderItem.isPromotionEligible || !isWholeUnitQuantity(quantity)) {
      promotedItems.push(preparedOrderItem);
      continue;
    }

    let freeUnits = 0;
    let requestedRedeemFreeUnits = manualRedemption
      ? Math.max(0, Math.trunc(preparedOrderItem.requestedRedeemFreeUnits))
      : Number.POSITIVE_INFINITY;

    for (let currentUnit = 0; currentUnit < quantity; currentUnit += 1) {
      if (progressCount < 4) {
        if (!candidateProductIdsSet.has(preparedOrderItem.item.productId)) {
          candidateProductIdsSet.add(preparedOrderItem.item.productId);
          candidateProductIds.push(preparedOrderItem.item.productId);
        }
        progressCount = clampProgress(progressCount + 1);
        continue;
      }

      const isCandidateProduct = candidateProductIdsSet.has(preparedOrderItem.item.productId);
      const hasOrderFreeQuota = manualRedemption ? (remainingManualFreeUnits ?? 0) > 0 : true;
      const shouldRedeemUnit =
        isCandidateProduct && requestedRedeemFreeUnits > 0 && hasOrderFreeQuota;

      if (shouldRedeemUnit) {
        freeUnits += 1;
        requestedRedeemFreeUnits -= 1;
        if (manualRedemption) {
          remainingManualFreeUnits = Math.max(0, (remainingManualFreeUnits ?? 0) - 1);
        }
        progressCount = 0;
        candidateProductIds.length = 0;
        candidateProductIdsSet.clear();
        continue;
      }

      if (!isCandidateProduct) {
        candidateProductIdsSet.add(preparedOrderItem.item.productId);
        candidateProductIds.push(preparedOrderItem.item.productId);
      }
      progressCount = 4;
    }

    if (freeUnits <= 0) {
      promotedItems.push(preparedOrderItem);
      continue;
    }

    const originalSubtotalCents = preparedOrderItem.item.subtotalCents;
    const originalTaxesCents = preparedOrderItem.item.taxesCents;
    const originalGrandTotalCents = preparedOrderItem.item.grandTotalCents;

    const itemPromotionDiscountCents = splitAmountByQuantity({
      total: originalGrandTotalCents,
      quantity,
      splitQuantity: freeUnits,
    });

    if (itemPromotionDiscountCents <= 0) {
      promotedItems.push(preparedOrderItem);
      continue;
    }

    const subtotalDiscountCents = splitAmountByQuantity({
      total: originalSubtotalCents,
      quantity,
      splitQuantity: freeUnits,
    });
    const taxesDiscountCents = itemPromotionDiscountCents - subtotalDiscountCents;

    preparedOrderItem.item.freeUnits = freeUnits;
    preparedOrderItem.item.promotionCode = ORDER_PROMOTION_CODE;
    preparedOrderItem.item.promotionDiscountCents = itemPromotionDiscountCents;
    preparedOrderItem.item.subtotalCents = Math.max(
      0,
      originalSubtotalCents - subtotalDiscountCents,
    );
    preparedOrderItem.item.taxesCents = Math.max(0, originalTaxesCents - taxesDiscountCents);
    preparedOrderItem.item.grandTotalCents = Math.max(
      0,
      originalGrandTotalCents - itemPromotionDiscountCents,
    );
    preparedOrderItem.lineType = freeUnits >= quantity ? "free" : "paid";

    promotionDiscountCents += itemPromotionDiscountCents;

    const appliedOrderItemId =
      splitMixedLines && manualRedemption && freeUnits > 0 && freeUnits < quantity
        ? `${preparedOrderItem.item.id}_free`
        : preparedOrderItem.item.id;

    appliedItems.push({
      orderItemId: appliedOrderItemId,
      productId: preparedOrderItem.item.productId,
      freeUnits,
      promotionDiscountCents: itemPromotionDiscountCents,
    });

    if (splitMixedLines && manualRedemption && freeUnits > 0 && freeUnits < quantity) {
      promotedItems.push(
        ...splitPreparedOrderItem({
          sourceItem: preparedOrderItem,
          freeUnits,
          originalSubtotalCents,
          originalTaxesCents,
        }),
      );
    } else {
      promotedItems.push(preparedOrderItem);
    }
  }

  const finalItems = promotedItems.map((item, index) => ({
    ...item,
    item: {
      ...item.item,
      sortOrder: index,
    },
  }));

  const subtotalCents = finalItems.reduce(
    (accumulator, preparedOrderItem) => accumulator + preparedOrderItem.item.subtotalCents,
    0,
  );
  const taxesCents = finalItems.reduce(
    (accumulator, preparedOrderItem) => accumulator + preparedOrderItem.item.taxesCents,
    0,
  );

  const promotion: OrderPromotionResponse = {
    code: ORDER_PROMOTION_CODE,
    discountCents: promotionDiscountCents,
    progress: {
      progressCount,
      candidateProductIds,
      eligibleForFreeDrink: progressCount === 4,
    },
    appliedItems,
  };

  return {
    payload: {
      items: finalItems,
      subtotalCents,
      taxesCents,
      grandTotalCents: subtotalCents + taxesCents,
    },
    promotion,
    nextState: {
      progressCount,
      candidateProductIds,
    },
  };
}

export function buildPromotionlessPreview(
  result: Pick<
    OrderResponse,
    | "tipType"
    | "tipRateBps"
    | "tipCents"
    | "subtotalCents"
    | "taxesCents"
    | "grandTotalCents"
    | "promotionDiscountCents"
    | "couponDiscountCents"
    | "items"
  >,
): OrderPreviewResponse {
  return {
    ...result,
    promotion: null,
    coupon: null,
  };
}
