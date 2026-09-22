import { describe, expect, it } from "vitest";
import { productResponseSchema } from "../product.schemas";
import { createBodySchema } from "./create.schemas";

const unitId = "V1StGXR8_Z5jdHi6B-myT";
const groupId = "vrGroup12345678901234";
const optionId = "vrOption1234567890123";
const ingredientId = "Uakgb_J5m9g-0JDMbcJqL";
const recipe = {
  description: null,
  ingredients: [{ ingredientId, quantity: 1 }],
  supplies: [],
};
const variation = {
  price: 65,
  kitchenName: null,
  customerDescription: null,
  kitchenDescription: null,
  selections: [{ variationGroupId: groupId, variationOptionId: optionId }],
};

describe("create product contract", () => {
  it("accepts variation prices and recipes without base price or recipe", () => {
    expect(
      createBodySchema.parse({
        name: "Latte",
        unitId,
        productType: "assembled",
        variationGroupIds: [groupId],
        variations: [{ ...variation, recipe }],
      }),
    ).toMatchObject({
      variationGroupIds: [groupId],
      variations: [{ ...variation, recipe }],
    });

    expect(() =>
      createBodySchema.parse({
        name: "Latte",
        unitId,
        productType: "assembled",
        variationGroupIds: [groupId],
        variations: [variation],
      }),
    ).toThrow();
  });

  it("allows a product without a customer description in the create response", () => {
    expect(
      productResponseSchema.parse({
        id: "product-id",
        name: "Latte",
        kitchenName: null,
        priceCents: null,
        isFeatured: false,
        customerDescription: null,
        kitchenDescription: null,
        image: null,
        unit: { id: unitId, name: "Pieza", abbreviation: "pza", precision: 0 },
        category: null,
        categories: [],
        taxes: [],
        organizations: [],
        modifiers: [],
        productType: "assembled",
        recipe: null,
        variationGroups: [],
        variations: [],
        compoundComponents: [],
      }).customerDescription,
    ).toBeNull();
  });
});
