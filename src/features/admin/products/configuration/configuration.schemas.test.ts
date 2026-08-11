import { describe, expect, it } from "vitest";
import {
  replaceModifiersBodySchema,
  replaceVariationConfigurationBodySchema,
} from "./configuration.schemas";

const variation = {
  price: 65,
  kitchenName: null,
  customerDescription: null,
  kitchenDescription: null,
  selections: [
    {
      variationGroupId: "vrGroup12345678901234",
      variationOptionId: "vrOption1234567890123",
    },
  ],
};

describe("product configuration schemas", () => {
  it("accepts a variation matrix without a base price", () => {
    expect(
      replaceVariationConfigurationBodySchema.parse({
        variationGroupIds: ["vrGroup12345678901234"],
        variations: [variation],
      }),
    ).toEqual({
      variationGroupIds: ["vrGroup12345678901234"],
      variations: [variation],
    });
  });

  it("requires a base price when all variations are removed", () => {
    expect(() =>
      replaceVariationConfigurationBodySchema.parse({
        variationGroupIds: [],
        variations: [],
      }),
    ).toThrow();
    expect(
      replaceVariationConfigurationBodySchema.parse({
        variationGroupIds: [],
        variations: [],
        basePrice: 65,
      }),
    ).toEqual({ variationGroupIds: [], variations: [], basePrice: 65 });
  });

  it("rejects base pricing alongside variations", () => {
    expect(() =>
      replaceVariationConfigurationBodySchema.parse({
        variationGroupIds: ["vrGroup12345678901234"],
        variations: [variation],
        basePrice: 65,
      }),
    ).toThrow();
  });

  it("represents all modifier options with null and subsets with non-empty arrays", () => {
    expect(
      replaceModifiersBodySchema.parse({
        modifiers: [
          {
            modifierId: "modifier1234567890123",
            optionIds: null,
            visibleWhen: [],
          },
        ],
      }).modifiers[0]?.optionIds,
    ).toBeNull();
    expect(() =>
      replaceModifiersBodySchema.parse({
        modifiers: [
          {
            modifierId: "modifier1234567890123",
            optionIds: [],
            visibleWhen: [],
          },
        ],
      }),
    ).toThrow();
  });
});
