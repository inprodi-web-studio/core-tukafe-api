import { normalizeString, validation } from "@core/utils";
import type {
  CreateOrderParams,
  CreateOrderTipParams,
  NormalizedCreateOrderParams,
  NormalizedCreateOrderTipParams,
} from "./orders.types";

function normalizeNullableText(value?: string | null): string | null {
  const normalizedValue = normalizeString(value, { trim: true, collapseWhitespace: true });

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function normalizeOrderTipInput(tip?: CreateOrderTipParams | null): NormalizedCreateOrderTipParams {
  if (!tip || tip.type === "none") {
    return {
      type: "none",
      rateBps: null,
      amountCents: null,
    };
  }

  if (tip.type === "percentage") {
    return {
      type: "percentage",
      rateBps: tip.rateBps,
      amountCents: null,
    };
  }

  return {
    type: "amount",
    rateBps: null,
    amountCents: tip.amountCents,
  };
}

export function normalizeCreateOrderInput({
  comment,
  items,
  customerId,
  couponCode,
  cashbackRedeemCents,
  tip,
  ...rest
}: CreateOrderParams): NormalizedCreateOrderParams {
  const normalizedItems = items.map((item) => {
    const clientItemId = normalizeString(item.clientItemId, {
      trim: true,
      collapseWhitespace: true,
      maxLength: 120,
    });

    return {
      ...item,
      variationId: item.variationId ?? null,
      comment: normalizeNullableText(item.comment),
      clientItemId: clientItemId.length > 0 ? clientItemId : null,
      redeemFreeUnits: item.redeemFreeUnits ?? 0,
      modifiers: (item.modifiers ?? []).map((modifier) => ({
        modifierOptionId: modifier.modifierOptionId,
        quantity: modifier.quantity ?? 1,
      })),
      components: (item.components ?? []).map((component) => ({
        componentId: normalizeString(component.componentId ?? component.slotId ?? "", {
          trim: true,
          collapseWhitespace: true,
          maxLength: 160,
        }),
        slotId: normalizeString(component.slotId ?? component.componentId ?? "", {
          trim: true,
          collapseWhitespace: true,
          maxLength: 160,
        }),
        slotOptionId: normalizeString(component.slotOptionId ?? "", {
          trim: true,
          collapseWhitespace: true,
          maxLength: 160,
        }) || null,
        productId: component.productId,
        variationId: component.variationId ?? null,
        modifiers: (component.modifiers ?? []).map((modifier) => ({
          modifierOptionId: modifier.modifierOptionId,
          quantity: modifier.quantity ?? 1,
        })),
      })),
    };
  });

  const hasManualClientItemIds = normalizedItems.some((item) => item.clientItemId !== null);

  if (hasManualClientItemIds && normalizedItems.some((item) => item.clientItemId === null)) {
    throw validation(
      "order.manualPromotion.clientItemIdRequired",
      "All items must include clientItemId when manual promotion mode is used",
    );
  }

  const normalizedCashbackRedeemCents = cashbackRedeemCents ?? 0;
  if (!Number.isInteger(normalizedCashbackRedeemCents) || normalizedCashbackRedeemCents < 0) {
    throw validation(
      "cashback.redemption.invalidAmount",
      "cashbackRedeemCents must be a non-negative integer",
    );
  }

  return {
    ...rest,
    customerId: customerId ?? null,
    couponCode:
      normalizeString(couponCode, {
        trim: true,
        uppercase: true,
        collapseWhitespace: true,
        removeWhitespace: true,
        maxLength: 64,
      }) || null,
    cashbackRedeemCents: normalizedCashbackRedeemCents,
    comment: normalizeNullableText(comment),
    tip: normalizeOrderTipInput(tip),
    items: normalizedItems,
  };
}

export function resolveVariationName(variation: {
  customerDescription: string | null;
  kitchenName: string | null;
  selections: Array<{
    group: {
      name: string;
      sortOrder: number;
    };
    option: {
      name: string;
    };
  }>;
}): string | null {
  const selectionName = [...variation.selections]
    .sort((left, right) => {
      if (left.group.sortOrder !== right.group.sortOrder) {
        return left.group.sortOrder - right.group.sortOrder;
      }

      if (left.group.name !== right.group.name) {
        return left.group.name.localeCompare(right.group.name);
      }

      return left.option.name.localeCompare(right.option.name);
    })
    .map((selection) => selection.option.name)
    .join(" / ");

  return variation.kitchenName || selectionName || variation.customerDescription || null;
}

export function buildOrderFolioPrefix(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);

  return `${month}-${year}`;
}

export function formatOrderFolio(prefix: string, sequence: number): string {
  return `${prefix}-${String(sequence).padStart(6, "0")}`;
}

export function calculateExtendedPriceCents(unitPriceCents: number, quantity: number): number {
  return Math.round(unitPriceCents * quantity);
}

export function calculateTaxAmountCents(subtotalCents: number, taxRateBps: number): number {
  return Math.round((subtotalCents * taxRateBps) / 10000);
}

export function calculateIncludedTaxBreakdown(
  grossTotalCents: number,
  taxRatesBps: number[],
): {
  subtotalCents: number;
  taxAmountsCents: number[];
} {
  const normalizedGrossTotalCents = Math.max(0, Math.round(grossTotalCents));
  const normalizedTaxRatesBps = taxRatesBps.map((rate) => Math.max(0, Math.trunc(rate)));
  const totalTaxRateBps = normalizedTaxRatesBps.reduce(
    (accumulator, rate) => accumulator + rate,
    0,
  );

  if (normalizedGrossTotalCents <= 0 || totalTaxRateBps <= 0) {
    return {
      subtotalCents: normalizedGrossTotalCents,
      taxAmountsCents: normalizedTaxRatesBps.map(() => 0),
    };
  }

  const subtotalCents = Math.round((normalizedGrossTotalCents * 10000) / (10000 + totalTaxRateBps));
  const includedTaxTotalCents = normalizedGrossTotalCents - subtotalCents;
  let remainingTaxCents = includedTaxTotalCents;

  const taxAmountsCents = normalizedTaxRatesBps.map((rate, index) => {
    if (rate <= 0) {
      return 0;
    }

    const isLastTax = index === normalizedTaxRatesBps.length - 1;
    if (isLastTax) {
      return remainingTaxCents;
    }

    const taxAmountCents = Math.min(
      remainingTaxCents,
      Math.round((includedTaxTotalCents * rate) / totalTaxRateBps),
    );
    remainingTaxCents -= taxAmountCents;
    return taxAmountCents;
  });

  return {
    subtotalCents,
    taxAmountsCents,
  };
}

export function calculateTipCents(
  tip: NormalizedCreateOrderTipParams,
  totalBeforeTipCents: number,
): number {
  if (tip.type === "none") {
    return 0;
  }

  if (tip.type === "amount") {
    return tip.amountCents ?? 0;
  }

  return Math.round((totalBeforeTipCents * (tip.rateBps ?? 0)) / 10000);
}
