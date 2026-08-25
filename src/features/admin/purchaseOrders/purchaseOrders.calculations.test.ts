import { describe, expect, it } from "vitest";
import { calculateBaseQuantity, calculatePurchaseLineTotals } from "./purchaseOrders.calculations";

describe("purchase order calculations", () => {
  it("rounds line subtotal and each configured tax to cents", () => {
    expect(calculatePurchaseLineTotals(2.5, 801, [1600, 100])).toEqual({
      subtotalCents: 2003,
      taxAmountsCents: [320, 20],
      taxCents: 340,
      totalCents: 2343,
    });
  });

  it("accepts fractional presentations when the base unit precision is respected", () => {
    expect(calculateBaseQuantity(0.5, 12, 0)).toEqual({
      quantity: 6,
      respectsPrecision: true,
    });
    expect(calculateBaseQuantity(0.333, 12, 0).respectsPrecision).toBe(false);
  });
});
