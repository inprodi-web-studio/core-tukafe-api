const QUANTITY_FACTOR = 1_000_000;

export function roundPurchaseQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * QUANTITY_FACTOR) / QUANTITY_FACTOR;
}

export function calculatePurchaseLineTotals(
  quantity: number,
  unitPriceCents: number,
  taxRatesBps: readonly number[],
) {
  const subtotalCents = Math.round(quantity * unitPriceCents);
  const taxAmountsCents = taxRatesBps.map((rate) => Math.round((subtotalCents * rate) / 10_000));
  const taxCents = taxAmountsCents.reduce((sum, amount) => sum + amount, 0);
  return {
    subtotalCents,
    taxAmountsCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
  };
}

export function calculateBaseQuantity(
  presentationQuantity: number,
  contentQuantity: number,
  baseUnitPrecision: number,
) {
  const raw = presentationQuantity * contentQuantity;
  const factor = 10 ** baseUnitPrecision;
  const roundedToUnit = Math.round((raw + Number.EPSILON) * factor) / factor;
  const normalized = roundPurchaseQuantity(raw);
  return {
    quantity: normalized,
    respectsPrecision: Math.abs(normalized - roundedToUnit) <= 0.0000001,
  };
}
