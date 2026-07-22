import { describe, expect, it } from "vitest";

import { calculateVariationPrices } from "./product-price-sync.helpers";

describe("calculateVariationPrices", () => {
  it("conserva diferenciales de café y aplica las reglas de leche", () => {
    const result = calculateVariationPrices(6_900, [
      {
        key: "tradicion-entera",
        currentPriceCents: 6_600,
        selections: [
          { groupName: "Tipo de Café", optionName: "Tukafe Tradición" },
          { groupName: "Tipo de Leche", optionName: "Entera" },
        ],
      },
      {
        key: "tradicion-deslactosada",
        currentPriceCents: 6_600,
        selections: [
          { groupName: "Tipo de Café", optionName: "Tukafe Tradición" },
          { groupName: "Tipo de Leche", optionName: "Deslactosada" },
        ],
      },
      {
        key: "tradicion-almendra",
        currentPriceCents: 7_800,
        selections: [
          { groupName: "Tipo de Café", optionName: "Tukafe Tradición" },
          { groupName: "Tipo de Leche", optionName: "Almendra" },
        ],
      },
      {
        key: "distincion-entera",
        currentPriceCents: 8_600,
        selections: [
          { groupName: "Tipo de Café", optionName: "Tukafe Distinción" },
          { groupName: "Tipo de Leche", optionName: "Entera" },
        ],
      },
      {
        key: "distincion-deslactosada",
        currentPriceCents: 8_600,
        selections: [
          { groupName: "Tipo de Café", optionName: "Tukafe Distinción" },
          { groupName: "Tipo de Leche", optionName: "Deslactosada" },
        ],
      },
      {
        key: "distincion-avena",
        currentPriceCents: 9_800,
        selections: [
          { groupName: "Tipo de Café", optionName: "Tukafe Distinción" },
          { groupName: "Tipo de Leche", optionName: "Avena Oatly" },
        ],
      },
    ]);

    expect(Object.fromEntries(result.map((item) => [item.key, item.nextPriceCents]))).toEqual({
      "tradicion-entera": 6_900,
      "tradicion-deslactosada": 7_900,
      "tradicion-almendra": 8_100,
      "distincion-entera": 8_900,
      "distincion-deslactosada": 9_900,
      "distincion-avena": 10_100,
    });
  });

  it("conserva tamaño y tipo de café cuando no hay leche", () => {
    const result = calculateVariationPrices(5_500, [
      {
        key: "tradicion-sencillo",
        currentPriceCents: 4_000,
        selections: [
          { groupName: "Tipo de Café", optionName: "Tukafe Tradición" },
          { groupName: "Tamaño Espresso", optionName: "Sencillo" },
        ],
      },
      {
        key: "tradicion-doble",
        currentPriceCents: 5_500,
        selections: [
          { groupName: "Tipo de Café", optionName: "Tukafe Tradición" },
          { groupName: "Tamaño Espresso", optionName: "Doble" },
        ],
      },
      {
        key: "distincion-sencillo",
        currentPriceCents: 6_000,
        selections: [
          { groupName: "Tipo de Café", optionName: "Tukafe Distinción" },
          { groupName: "Tamaño Espresso", optionName: "Sencillo" },
        ],
      },
      {
        key: "distincion-doble",
        currentPriceCents: 8_000,
        selections: [
          { groupName: "Tipo de Café", optionName: "Tukafe Distinción" },
          { groupName: "Tamaño Espresso", optionName: "Doble" },
        ],
      },
    ]);

    expect(result.map((item) => item.nextPriceCents)).toEqual([5_500, 7_000, 7_500, 9_500]);
  });

  it("rechaza una leche especial sin contraparte regular", () => {
    expect(() =>
      calculateVariationPrices(6_900, [
        {
          key: "almendra",
          currentPriceCents: 7_800,
          selections: [{ groupName: "Tipo de Leche", optionName: "Almendra" }],
        },
      ]),
    ).toThrow("No existe una variación base");
  });
});
