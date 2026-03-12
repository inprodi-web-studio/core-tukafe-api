import { normalizeString } from "@core/utils";
import type {
  CreateOrderServiceParams,
  NormalizedCreateOrderServiceParams,
} from "./orders.types";

function normalizeNullableText(value?: string | null): string | null {
  const normalizedValue = normalizeString(value, { trim: true, collapseWhitespace: true });

  return normalizedValue.length > 0 ? normalizedValue : null;
}

export function normalizeCreateOrderInput({
  comment,
  items,
  ...rest
}: CreateOrderServiceParams): NormalizedCreateOrderServiceParams {
  return {
    ...rest,
    comment: normalizeNullableText(comment),
    items: items.map((item) => ({
      ...item,
      variationId: item.variationId ?? null,
      comment: normalizeNullableText(item.comment),
      modifiers: (item.modifiers ?? []).map((modifier) => ({
        modifierOptionId: modifier.modifierOptionId,
        quantity: modifier.quantity ?? 1,
      })),
    })),
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

  return selectionName || variation.customerDescription || variation.kitchenName || null;
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
