import { describe, expect, it } from "vitest";
import { createAdjustmentBodySchema } from "./inventory.schemas";

describe("inventory adjustment schema", () => {
  it("requires a reason but accepts an adjustment without observations", () => {
    expect(
      createAdjustmentBodySchema.safeParse({
        direction: "entry",
        reason: "other",
        lines: [{ inventoryItemId: "ingredient-1", quantity: 12 }],
      }).success,
    ).toBe(true);

    expect(
      createAdjustmentBodySchema.safeParse({
        direction: "entry",
        lines: [{ inventoryItemId: "ingredient-1", quantity: 12 }],
      }).success,
    ).toBe(false);
  });

  it("does not accept an unsupported reference field", () => {
    expect(
      createAdjustmentBodySchema.safeParse({
        direction: "entry",
        reason: "initial_inventory",
        reference: "legacy-reference",
        lines: [{ inventoryItemId: "ingredient-1", quantity: 12 }],
      }).success,
    ).toBe(false);
  });
});
