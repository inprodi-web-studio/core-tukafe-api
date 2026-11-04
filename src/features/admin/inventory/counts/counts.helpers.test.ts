import { describe, expect, it } from "vitest";
import { countQuantitySchema, createCountSchema, saveCountSchema } from "./counts.schemas";
import {
  countConfigurationMatches,
  groupCountBalances,
  distributeCount,
  normalizeCountLot,
  validateCountLot,
  validateCountQuantity,
} from "./counts.helpers";
import type { InventoryCountItemSnapshot } from "@core/db/schemas";
const item: InventoryCountItemSnapshot = {
  id: "milk",
  name: "Leche",
  kind: "ingredient",
  isTracked: true,
  tracksLots: true,
  isPerishable: true,
  unit: { id: "l", name: "Litros", abbreviation: "L", precision: 3 },
};

describe("physical counts contracts", () => {
  it("groups anonymous perishable partitions by expiration without mixing dates", () => {
    const anonymous = { ...item, tracksLots: false };
    const groups = groupCountBalances(anonymous, [
      { lotId: "a", lotCode: null, expiresOn: "2026-12-01", onHandQuantity: 4 },
      { lotId: "b", lotCode: null, expiresOn: "2026-12-01", onHandQuantity: 6 },
      { lotId: "c", lotCode: null, expiresOn: "2026-12-02", onHandQuantity: 3 },
    ]);
    expect(groups.map((g) => [g.expiresOn, g.onHandQuantity])).toEqual([
      ["2026-12-01", 10],
      ["2026-12-02", 3],
    ]);
    expect(groups.every((g) => g.lotId === null)).toBe(true);
    expect(
      groupCountBalances(item, [
        { lotId: "a", lotCode: "A", expiresOn: "2026-12-01", onHandQuantity: 4 },
        { lotId: "b", lotCode: "B", expiresOn: "2026-12-01", onHandQuantity: 6 },
      ]),
    ).toHaveLength(2);
  });
  it("distinguishes zero from uncounted and does not require observations", () => {
    expect(createCountSchema.parse({})).toEqual({});
    expect(
      saveCountSchema
        .parse({
          version: 1,
          lines: [
            { id: "a", countedQuantity: 0 },
            { id: "b", countedQuantity: null },
          ],
        })
        .lines.map((l) => l.countedQuantity),
    ).toEqual([0, null]);
    expect(createCountSchema.safeParse({ reference: "x" }).success).toBe(false);
    expect(
      saveCountSchema.safeParse({ version: 1, appliedAt: "2020-01-01", lines: [] }).success,
    ).toBe(false);
  });
  it("validates base-unit precision and numeric bounds", () => {
    expect(() => validateCountQuantity(1.234, 3)).not.toThrow();
    for (const n of [-1, NaN, Infinity, 1000000, 1.2345])
      expect(() => validateCountQuantity(n, 3)).toThrow();
    expect(countQuantitySchema.safeParse(0.0000001).success).toBe(false);
  });
  it("allows expired found lots while enforcing lot/expiration configuration", () => {
    expect(() => validateCountLot(item, "A", "2020-01-01")).not.toThrow();
    expect(() => validateCountLot(item, null, "2020-01-01")).toThrow();
    expect(() => validateCountLot(item, "A", null)).toThrow();
    expect(normalizeCountLot("  A   B  ")).toEqual({ lotCode: "A B", normalizedLotCode: "a b" });
  });
  it("requires a fresh document if tracking or units changed", () => {
    expect(countConfigurationMatches(item, { ...item, name: "New name" })).toBe(true);
    expect(countConfigurationMatches(item, { ...item, tracksLots: false })).toBe(false);
    expect(countConfigurationMatches(item, { ...item, unit: { ...item.unit, precision: 2 } })).toBe(
      false,
    );
    expect(countConfigurationMatches(item, undefined)).toBe(false);
  });
  it("distributes aggregate differences over hidden internal lots without losing precision", () => {
    const stock = [
      { lotId: "a", onHandQuantity: 4 },
      { lotId: "b", onHandQuantity: 6 },
    ];
    expect(distributeCount(3, stock).map((b) => b.target)).toEqual([0, 3]);
    expect(distributeCount(12, stock).map((b) => b.target)).toEqual([6, 6]);
    expect(distributeCount(0, stock).map((b) => b.target)).toEqual([0, 0]);
    expect(stock.map((b) => b.onHandQuantity)).toEqual([4, 6]);
    expect(
      distributeCount(7, [
        { lotId: "reserved", onHandQuantity: 5, reservedQuantity: 5 },
        { lotId: "free", onHandQuantity: 5, reservedQuantity: 0 },
      ]).map((b) => b.target),
    ).toEqual([5, 2]);
    expect(
      distributeCount(8, [
        { lotId: "deficit", onHandQuantity: 2, reservedQuantity: 5 },
        { lotId: "free", onHandQuantity: 5, reservedQuantity: 0 },
      ]).map((b) => b.target),
    ).toEqual([3, 5]);
  });
});
