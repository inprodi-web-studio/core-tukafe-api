import { describe, expect, it } from "vitest";
import { resolveInventoryRequirementsAvailability } from "./inventory.service";

describe("inventory availability", () => {
  it("calculates the maximum producible quantity from the limiting requirement", () => {
    expect(
      resolveInventoryRequirementsAvailability(
        [
          { inventoryItemId: "coffee", quantity: 2 },
          { inventoryItemId: "cup", quantity: 1 },
        ],
        new Map([
          ["coffee", 5],
          ["cup", 8],
        ]),
      ),
    ).toEqual({ isAvailable: true, reason: "available", maxProducible: 2 });
  });

  it("marks a recipe sold out when any required item has no available stock", () => {
    expect(
      resolveInventoryRequirementsAvailability(
        [{ inventoryItemId: "milk", quantity: 0.25 }],
        new Map([["milk", 0]]),
      ),
    ).toEqual({ isAvailable: false, reason: "sold_out", maxProducible: 0 });
  });

  it("keeps untracked products available without an artificial limit", () => {
    expect(resolveInventoryRequirementsAvailability([], new Map())).toEqual({
      isAvailable: true,
      reason: "available",
      maxProducible: null,
    });
  });
});
