import {
  productCategoriesDB,
  productCategoryLinksDB,
  productsDB,
  productTaxDB,
  taxDB,
} from "@core/db/schemas";
import type { FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { adminProductsService } from "./products.service";

describe("admin product general update service", () => {
  it("actualiza campos y reemplaza categorías e impuestos dentro de una transacción", async () => {
    const updatedValues: Record<string, unknown>[] = [];
    const inserted = new Map<unknown, unknown>();
    const deleted: unknown[] = [];
    const getGeneral = vi.fn().mockResolvedValue({ id: "product-id", name: "Latte especial" });
    const unitGet = vi.fn().mockResolvedValue({ id: "unit-id" });
    const tx = {
      update: vi.fn((table: unknown) => {
        expect(table).toBe(productsDB);
        return {
          set: vi.fn((values: Record<string, unknown>) => {
            updatedValues.push(values);
            return {
              where: vi.fn(() => ({
                returning: vi.fn().mockResolvedValue([{ id: "product-id" }]),
              })),
            };
          }),
        };
      }),
      delete: vi.fn((table: unknown) => ({
        where: vi.fn(async () => {
          deleted.push(table);
        }),
      })),
      insert: vi.fn((table: unknown) => ({
        values: vi.fn(async (values: unknown) => {
          inserted.set(table, values);
        }),
      })),
    };
    const db = {
      query: {
        productsDB: { findFirst: vi.fn().mockResolvedValue({ id: "product-id" }) },
        uploadsDB: {
          findFirst: vi.fn().mockResolvedValue({ id: "image-id", mimeType: "image/webp" }),
        },
      },
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => ({
          where: vi.fn().mockResolvedValue(
            table === productCategoriesDB
              ? [{ id: "category-one" }, { id: "category-two" }]
              : table === taxDB
                ? [{ id: "tax-one" }]
                : [],
          ),
        })),
      })),
      transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
    };
    const fastify = {
      db,
      admin: {
        units: { get: unitGet },
        products: { getGeneral },
      },
    } as unknown as FastifyInstance;

    const result = await adminProductsService(fastify).updateGeneral("product-id", {
      name: "  Latte   especial ",
      kitchenName: "  Latte   grande ",
      customerDescription: " ",
      kitchenDescription: null,
      unitId: "unit-id",
      imageUploadId: "image-id",
      isFeatured: true,
      categoryIds: ["category-one", "category-two", "category-one"],
      taxIds: ["tax-one", "tax-one"],
    });

    expect(unitGet).toHaveBeenCalledWith("unit-id");
    expect(updatedValues[0]).toEqual(
      expect.objectContaining({
        name: "Latte especial",
        kitchenName: "Latte grande",
        customerDescription: null,
        kitchenDescription: null,
        unitId: "unit-id",
        imageUploadId: "image-id",
        isFeatured: true,
        categoryId: "category-one",
      }),
    );
    expect(updatedValues[0]).not.toHaveProperty("priceCents");
    expect(updatedValues[0]).not.toHaveProperty("productType");
    expect(deleted).toEqual([productCategoryLinksDB, productTaxDB]);
    expect(inserted.get(productCategoryLinksDB)).toEqual([
      { productId: "product-id", categoryId: "category-one" },
      { productId: "product-id", categoryId: "category-two" },
    ]);
    expect(inserted.get(productTaxDB)).toEqual([
      { productId: "product-id", taxId: "tax-one" },
    ]);
    expect(getGeneral).toHaveBeenCalledWith("product-id");
    expect(result).toEqual({ id: "product-id", name: "Latte especial" });
  });

  it("permite limpiar imagen, categorías e impuestos", async () => {
    const updatedValues: Record<string, unknown>[] = [];
    const deleted: unknown[] = [];
    const tx = {
      update: vi.fn(() => ({
        set: vi.fn((values: Record<string, unknown>) => {
          updatedValues.push(values);
          return {
            where: vi.fn(() => ({
              returning: vi.fn().mockResolvedValue([{ id: "product-id" }]),
            })),
          };
        }),
      })),
      delete: vi.fn((table: unknown) => ({
        where: vi.fn(async () => {
          deleted.push(table);
        }),
      })),
      insert: vi.fn(),
    };
    const fastify = {
      db: {
        query: {
          productsDB: { findFirst: vi.fn().mockResolvedValue({ id: "product-id" }) },
          uploadsDB: { findFirst: vi.fn() },
        },
        select: vi.fn(),
        transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
      },
      admin: {
        units: { get: vi.fn() },
        products: { getGeneral: vi.fn().mockResolvedValue({ id: "product-id" }) },
      },
    } as unknown as FastifyInstance;

    await adminProductsService(fastify).updateGeneral("product-id", {
      imageUploadId: null,
      categoryIds: [],
      taxIds: [],
    });

    expect(updatedValues[0]).toEqual(
      expect.objectContaining({
        imageUploadId: null,
        categoryId: null,
      }),
    );
    expect(deleted).toEqual([productCategoryLinksDB, productTaxDB]);
    expect(tx.insert).not.toHaveBeenCalled();
  });
});
