import type { FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { guestProductCategoriesService } from "./productCategories.service";

describe("public category visibility", () => {
  const source = [
    { id: "drinks", parentId: null },
    { id: "coffee", parentId: "drinks" },
    { id: "food", parentId: null },
  ].map((category) => ({
    ...category,
    name: category.id,
    icon: "CircleDashedIcon",
    color: "#83987E",
    sortOrder: 0,
    isFourPlusOneEligible: false,
    isCashbackEligible: false,
    image: null,
  }));

  it("omits disabled roots and descendants, never promoting descendants to roots", async () => {
    let selects = 0;
    const fastify = {
      db: {
        query: { productCategoriesDB: { findMany: vi.fn().mockResolvedValue(source) } },
        select: vi.fn(() => ({
          from: vi.fn(() => {
            selects += 1;
            return selects === 1
              ? Promise.resolve(source)
              : { where: vi.fn().mockResolvedValue([{ categoryId: "drinks", isActive: false }]) };
          }),
        })),
      },
    } as unknown as FastifyInstance;
    expect(
      (await guestProductCategoriesService(fastify).list("branch-a")).map(
        (category) => category.id,
      ),
    ).toEqual(["food"]);
  });

  it("preserves the transition contract when organization is omitted", async () => {
    const fastify = {
      db: { query: { productCategoriesDB: { findMany: vi.fn().mockResolvedValue(source) } } },
    } as unknown as FastifyInstance;
    const result = await guestProductCategoriesService(fastify).list();
    expect(result.map((category) => category.id)).toEqual(["drinks", "food"]);
    expect(result[0]?.children[0]?.id).toBe("coffee");
  });
});
