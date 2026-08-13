import type { FastifyInstance, FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { normalizeIngredientCategoryInput } from "../ingredientCategories/ingredientCategories.helpers";
import { updateIngredientCategoryBodySchema } from "../ingredientCategories/ingredientCategories.schemas";
import { adminIngredientCategoriesService } from "../ingredientCategories/ingredientCategories.service";
import { updateIngredientBodySchema } from "../ingredients/ingredients.schemas";
import { adminIngredientsService } from "../ingredients/ingredients.service";
import { normalizeSupplyCategoryInput } from "../supplyCategories/supplyCategories.helpers";
import { updateSupplyCategoryBodySchema } from "../supplyCategories/supplyCategories.schemas";
import { updateSupplyBodySchema } from "../supplies/supplies.schemas";
import { adminSuppliesService } from "../supplies/supplies.service";
import { requireGlobalInventoryOwner } from "./inventory.access";

function requestWithRole(role: string) {
  return {
    auth: { user: { id: "viewer" } },
    server: {
      db: {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ role }]) })),
          })),
        })),
      },
    },
  } as unknown as FastifyRequest;
}

function transactionFastify(results: unknown[][]) {
  const queued = [...results];
  const deletedWhere = vi.fn().mockResolvedValue(undefined);
  const tx = {
    select: vi.fn(() => {
      const result = queued.shift() ?? [];
      const builder = {
        from: vi.fn(),
        where: vi.fn(),
        limit: vi.fn().mockResolvedValue(result),
        for: vi.fn().mockResolvedValue(result),
        then: (resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject),
      };
      builder.from.mockReturnValue(builder);
      builder.where.mockReturnValue(builder);
      builder.limit.mockReturnValue(builder);
      return builder;
    }),
    delete: vi.fn(() => ({ where: deletedWhere })),
  };
  const fastify = {
    db: {
      transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<void>) =>
        callback(tx),
      ),
    },
  } as unknown as FastifyInstance;
  return { fastify, deletedWhere };
}

describe("global inventory catalog contracts", () => {
  it("allows writes only for the global owner", async () => {
    await expect(requireGlobalInventoryOwner(requestWithRole("owner"))).resolves.toBeUndefined();
    await expect(requireGlobalInventoryOwner(requestWithRole("admin"))).rejects.toMatchObject({
      code: "inventory.globalOwnerRequired",
      statusCode: 403,
    });
    await expect(requireGlobalInventoryOwner(requestWithRole("member"))).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("validates partial item updates and cost precision", () => {
    expect(updateIngredientBodySchema.parse({ description: null })).toEqual({ description: null });
    expect(updateSupplyBodySchema.parse({ baseCostPerUnit: 0.123456 })).toEqual({
      baseCostPerUnit: 0.123456,
    });
    expect(() => updateIngredientBodySchema.parse({})).toThrow();
    expect(() => updateIngredientBodySchema.parse({ name: "   " })).toThrow();
    expect(() => updateSupplyBodySchema.parse({ baseCostPerUnit: 0.1234567 })).toThrow();
  });

  it("defaults category icons and validates partial category updates", () => {
    expect(normalizeIngredientCategoryInput({ name: " Café ", color: "#aabbcc" })).toEqual({
      name: "Café",
      icon: "CircleDashedIcon",
      color: "#AABBCC",
    });
    expect(normalizeSupplyCategoryInput({ name: " Vasos ", color: "#112233" }).icon).toBe(
      "CircleDashedIcon",
    );
    expect(updateIngredientCategoryBodySchema.parse({ color: "#AABBCC" })).toEqual({
      color: "#AABBCC",
    });
    expect(() => updateSupplyCategoryBodySchema.parse({})).toThrow();
  });

  it("blocks ingredient deletion with dependency counts", async () => {
    const { fastify, deletedWhere } = transactionFastify([
      [{ id: "ingredient-1" }],
      [{ count: 2 }],
      [{ count: 1 }],
      [{ count: 3 }],
    ]);

    await expect(adminIngredientsService(fastify).remove("ingredient-1")).rejects.toMatchObject({
      code: "ingredient.inUse",
      statusCode: 409,
      data: { productRecipes: 2, variationRecipes: 1, modifierOptions: 3 },
    });
    expect(deletedWhere).not.toHaveBeenCalled();
  });

  it("deletes an unreferenced supply permanently", async () => {
    const { fastify, deletedWhere } = transactionFastify([
      [{ id: "supply-1" }],
      [{ count: 0 }],
      [{ count: 0 }],
      [{ count: 0 }],
    ]);

    await adminSuppliesService(fastify).remove("supply-1");
    expect(deletedWhere).toHaveBeenCalledOnce();
  });

  it("blocks category deletion while it contains articles", async () => {
    const { fastify, deletedWhere } = transactionFastify([[{ id: "category-1" }], [{ count: 4 }]]);

    await expect(
      adminIngredientCategoriesService(fastify).remove("category-1"),
    ).rejects.toMatchObject({
      code: "ingredientCategory.inUse",
      statusCode: 409,
      data: { items: 4 },
    });
    expect(deletedWhere).not.toHaveBeenCalled();
  });
});
