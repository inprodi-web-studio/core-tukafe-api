import {
  couponCategoryRulesDB,
  productCategoriesDB,
  productCategoryLinksDB,
  productsDB,
} from "@core/db/schemas";
import type { FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { adminProductcategoriesService } from "./productCategories.service";

describe("admin product categories service", () => {
  it("appends a new category and assigns the compatible generic icon", async () => {
    let inserted: Record<string, unknown> | undefined;
    const get = vi.fn().mockResolvedValue({ id: "category-new" });
    const fastify = {
      db: {
        select: vi.fn(() => ({
          from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ nextSortOrder: 4 }]) })),
        })),
        query: {
          uploadsDB: {
            findFirst: vi.fn().mockResolvedValue({ id: "image-id", mimeType: "image/webp" }),
          },
        },
        insert: vi.fn(() => ({
          values: vi.fn((values: Record<string, unknown>) => {
            inserted = values;
            return { returning: vi.fn().mockResolvedValue([{ id: "category-new" }]) };
          }),
        })),
      },
      admin: { productCategories: { get } },
    } as unknown as FastifyInstance;

    await adminProductcategoriesService(fastify).create({
      name: "Bebidas",
      color: "#83987e",
      imageUploadId: "image-id",
    });

    expect(inserted).toEqual(
      expect.objectContaining({
        icon: "CircleDashedIcon",
        imageUploadId: "image-id",
        sortOrder: 4,
      }),
    );
  });

  it("requires legacy categories without an image to receive one before editing", async () => {
    const fastify = {
      admin: {
        productCategories: {
          get: vi.fn().mockResolvedValue({ id: "legacy", parentId: null, image: null }),
        },
      },
    } as unknown as FastifyInstance;

    await expect(
      adminProductcategoriesService(fastify).update("legacy", { name: "Nuevo nombre" }),
    ).rejects.toMatchObject({ code: "productCategory.imageRequired", statusCode: 400 });
  });

  it("rejects assigning a descendant as parent", async () => {
    const categoryRow = {
      id: "category",
      name: "Bebidas",
      icon: "CircleDashedIcon",
      color: "#83987E",
      sortOrder: 0,
      isFourPlusOneEligible: false,
      isCashbackEligible: false,
      imageId: null,
      imageName: null,
      imagePath: null,
      imageVisibility: null,
      imageMimeType: null,
      parentId: null,
    };
    const get = vi.fn(async (id: string) => ({
      id,
      parentId: null,
      image: { id: "image", path: "/image.webp" },
    }));
    const fastify = {
      db: {
        execute: vi.fn().mockResolvedValue({
          rows: [categoryRow, { ...categoryRow, id: "descendant", parentId: "category" }],
        }),
      },
      admin: { productCategories: { get } },
    } as unknown as FastifyInstance;

    await expect(
      adminProductcategoriesService(fastify).update("category", { parentId: "descendant" }),
    ).rejects.toMatchObject({ code: "productCategory.invalidParent", statusCode: 400 });
  });

  it("normalizes and swaps sibling order transactionally", async () => {
    const updates: Array<{ id: string; sortOrder: number }> = [];
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn().mockResolvedValue([
              { id: "a", name: "A", sortOrder: 3 },
              { id: "b", name: "B", sortOrder: 3 },
              { id: "c", name: "C", sortOrder: 8 },
            ]),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((values: { sortOrder: number }) => ({
          where: vi.fn((condition: { queryChunks?: unknown[] }) => {
            const id = String(condition.queryChunks?.at(-1) ?? "");
            updates.push({ id, sortOrder: values.sortOrder });
          }),
        })),
      })),
    };
    const fastify = {
      db: { transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)) },
      admin: {
        productCategories: {
          get: vi.fn().mockResolvedValue({ id: "b", parentId: null }),
        },
      },
    } as unknown as FastifyInstance;

    await adminProductcategoriesService(fastify).reorder("b", "up");

    expect(updates.map((update) => update.sortOrder)).toEqual([0, 1, 2]);
    expect(tx.update).toHaveBeenCalledTimes(3);
  });

  it("blocks deletion and reports every dependency count", async () => {
    let categorySelectCount = 0;
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => ({
          where: vi.fn(async () => {
            if (table === productCategoriesDB) {
              categorySelectCount += 1;
              return categorySelectCount === 1 ? [{ id: "category" }] : [{ id: "child" }];
            }
            if (table === productsDB) return [{ id: "product-a" }];
            if (table === productCategoryLinksDB) return [{ id: "product-a" }, { id: "product-b" }];
            if (table === couponCategoryRulesDB) return [{ couponId: "coupon-a" }];
            return [];
          }),
        })),
      })),
      delete: vi.fn(),
    };
    const fastify = {
      db: { transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)) },
    } as unknown as FastifyInstance;

    await expect(adminProductcategoriesService(fastify).remove("category")).rejects.toMatchObject({
      code: "productCategory.inUse",
      statusCode: 409,
      data: { children: 1, products: 2, couponRules: 1 },
    });
    expect(tx.delete).not.toHaveBeenCalled();
  });
});
