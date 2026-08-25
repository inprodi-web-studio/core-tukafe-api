import { describe, expect, it } from "vitest";
import { purchaseOrderDraftBodySchema, receiptBodySchema } from "./purchaseOrders.schemas";

describe("purchase order schemas", () => {
  it("allows an incomplete draft without lines", () => {
    expect(
      purchaseOrderDraftBodySchema.safeParse({
        supplierId: "supplier-1",
        locationId: "location-1",
        lines: [],
      }).success,
    ).toBe(true);
  });

  it("rejects duplicate presentations", () => {
    expect(
      purchaseOrderDraftBodySchema.safeParse({
        supplierId: "supplier-1",
        locationId: "location-1",
        lines: [
          { presentationId: "p-1", quantity: 1, unitPriceCents: 100, taxIds: [] },
          { presentationId: "p-1", quantity: 2, unitPriceCents: 100, taxIds: [] },
        ],
      }).success,
    ).toBe(false);
  });

  it("requires at least one positive receipt allocation", () => {
    expect(receiptBodySchema.safeParse({ receivedOn: "2026-08-25", allocations: [] }).success).toBe(
      false,
    );
  });
});
