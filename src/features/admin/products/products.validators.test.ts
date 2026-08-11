import { describe, expect, it } from "vitest";
import type { ProductVariationGroupResponse } from "./products.types";
import { calculateVariationMatrixSize } from "./products.validators";

function group(id: string, optionCount: number): ProductVariationGroupResponse {
  return {
    id,
    name: id,
    customerLabel: null,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    options: Array.from({ length: optionCount }, (_value, index) => ({
      id: `${id}-option-${index}`,
      variationGroupId: id,
      name: `Option ${index}`,
      customerDescription: null,
      image: null,
      sortOrder: index,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  };
}

describe("calculateVariationMatrixSize", () => {
  it("calculates the cartesian product and returns zero without groups", () => {
    expect(calculateVariationMatrixSize([])).toBe(0);
    expect(calculateVariationMatrixSize([group("size", 5), group("milk", 4)])).toBe(20);
  });

  it("exposes configurations that exceed the 250 combination limit", () => {
    expect(calculateVariationMatrixSize([group("one", 10), group("two", 26)])).toBe(260);
  });
});
