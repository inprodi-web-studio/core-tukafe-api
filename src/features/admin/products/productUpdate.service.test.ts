import {
  productCategoriesDB,
  productCategoryLinksDB,
  productCompoundComponentsDB,
  productCompoundSlotOptionsDB,
  productCompoundSlotsDB,
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
        productsDB: {
          findFirst: vi.fn().mockResolvedValue({ id: "product-id", productType: "assembled" }),
        },
        uploadsDB: {
          findFirst: vi.fn().mockResolvedValue({ id: "image-id", mimeType: "image/webp" }),
        },
      },
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => ({
          where: vi
            .fn()
            .mockResolvedValue(
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

    const result = await adminProductsService(fastify).updateGeneral("product-id", "org-active", {
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
    expect(inserted.get(productTaxDB)).toEqual([{ productId: "product-id", taxId: "tax-one" }]);
    expect(getGeneral).toHaveBeenCalledWith("product-id", "org-active");
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
          productsDB: {
            findFirst: vi.fn().mockResolvedValue({ id: "product-id", productType: "assembled" }),
          },
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

    await adminProductsService(fastify).updateGeneral("product-id", "org-active", {
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

  it("reemplaza secciones y opciones compound en la misma transacción", async () => {
    const inserted = new Map<unknown, unknown>();
    const deleted: unknown[] = [];
    const getGeneral = vi.fn().mockResolvedValue({
      id: "compound-id",
      productType: "compound",
    });
    const tx = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: "compound-id" }]),
          })),
        })),
      })),
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
        productsDB: {
          findFirst: vi.fn().mockResolvedValue({ id: "compound-id", productType: "compound" }),
          findMany: vi.fn().mockResolvedValue([
            { id: "drink-id", productType: "assembled" },
            { id: "bread-id", productType: "simple" },
          ]),
        },
        uploadsDB: { findFirst: vi.fn() },
      },
      select: vi.fn(),
      transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
    };
    const fastify = {
      db,
      admin: {
        units: { get: vi.fn() },
        products: { getGeneral },
      },
    } as unknown as FastifyInstance;

    await adminProductsService(fastify).updateGeneral("compound-id", "org-active", {
      compoundSlots: [
        {
          label: "  Bebida ",
          quantity: 1,
          sortOrder: 0,
          options: [{ productId: "drink-id", label: null, sortOrder: 0 }],
        },
        {
          label: "Pan",
          quantity: 2,
          sortOrder: 1,
          options: [{ productId: "bread-id", label: " Croissant ", sortOrder: 0 }],
        },
      ],
    });

    expect(deleted).toEqual([productCompoundSlotsDB, productCompoundComponentsDB]);
    expect(inserted.get(productCompoundSlotsDB)).toEqual([
      expect.objectContaining({
        compoundProductId: "compound-id",
        label: "Bebida",
        quantity: 1,
        sortOrder: 0,
      }),
      expect.objectContaining({
        compoundProductId: "compound-id",
        label: "Pan",
        quantity: 2,
        sortOrder: 1,
      }),
    ]);
    expect(inserted.get(productCompoundSlotOptionsDB)).toEqual([
      expect.objectContaining({
        componentProductId: "drink-id",
        label: null,
        sortOrder: 0,
      }),
      expect.objectContaining({
        componentProductId: "bread-id",
        label: "Croissant",
        sortOrder: 0,
      }),
    ]);
    expect(getGeneral).toHaveBeenCalledWith("compound-id", "org-active");
  });

  it("rechaza compuestos anidados antes de abrir la transacción", async () => {
    const transaction = vi.fn();
    const fastify = {
      db: {
        query: {
          productsDB: {
            findFirst: vi.fn().mockResolvedValue({ id: "compound-id", productType: "compound" }),
            findMany: vi.fn().mockResolvedValue([
              { id: "nested-id", productType: "compound" },
              { id: "bread-id", productType: "simple" },
            ]),
          },
          uploadsDB: { findFirst: vi.fn() },
        },
        select: vi.fn(),
        transaction,
      },
      admin: {
        units: { get: vi.fn() },
        products: { getGeneral: vi.fn() },
      },
    } as unknown as FastifyInstance;

    await expect(
      adminProductsService(fastify).updateGeneral("compound-id", "org-active", {
        compoundSlots: [
          {
            label: "Bebida",
            quantity: 1,
            sortOrder: 0,
            options: [{ productId: "nested-id", label: null, sortOrder: 0 }],
          },
          {
            label: "Pan",
            quantity: 1,
            sortOrder: 1,
            options: [{ productId: "bread-id", label: null, sortOrder: 0 }],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "productCompoundSlotOption.nestedCompoundNotAllowed" });
    expect(transaction).not.toHaveBeenCalled();
  });
});
