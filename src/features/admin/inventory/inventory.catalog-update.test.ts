import type { FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { adminIngredientsService } from "../ingredients/ingredients.service";
import { adminSuppliesService } from "../supplies/supplies.service";

type CatalogKind = "ingredient" | "supply";

function catalogFastify(kind: CatalogKind, description: string | null = null) {
  const current = {
    id: "item-1",
    name: "Anterior",
    description,
    baseUnit: { id: "unit-1" },
    category: { id: "category-1" },
    baseCostPerUnit: 2,
    isInventoryTracked: true,
    tracksLots: false,
    isPerishable: false,
    expirationWarningDays: 3,
  };
  const get = vi.fn().mockResolvedValue(current);
  const execute = vi.fn().mockResolvedValue({ rows: [{ hasStock: true }] });
  const returning = vi.fn().mockResolvedValue([{ id: current.id }]);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  const update = vi.fn().mockReturnValue({ set });
  const fastify = {
    db: { execute, update },
    admin: {
      ingredients: { get },
      supplies: { get },
    },
  } as unknown as FastifyInstance;
  const service =
    kind === "ingredient" ? adminIngredientsService(fastify) : adminSuppliesService(fastify);

  return { current, execute, service, set, update };
}

describe.each<CatalogKind>(["ingredient", "supply"])("%s updates with stock", (kind) => {
  it.each([null, ""])(
    "allows a rename when the existing description is %j",
    async (description) => {
      const { current, execute, service, set } = catalogFastify(kind, description);

      await service.update(current.id, {
        name: " Nuevo nombre ",
        description: null,
        baseUnitId: current.baseUnit.id,
        categoryId: current.category.id,
        baseCostPerUnit: current.baseCostPerUnit,
        isInventoryTracked: current.isInventoryTracked,
        tracksLots: current.tracksLots,
        isPerishable: current.isPerishable,
        expirationWarningDays: current.expirationWarningDays,
      });

      expect(execute).not.toHaveBeenCalled();
      expect(set).toHaveBeenCalledWith(expect.objectContaining({ name: "Nuevo nombre" }));
      expect(set.mock.calls[0]?.[0]).not.toHaveProperty("description");
    },
  );

  it("rejects an actual change to another property", async () => {
    const { current, execute, service, update } = catalogFastify(kind);

    await expect(
      service.update(current.id, { name: "Nuevo nombre", baseUnitId: "unit-2" }),
    ).rejects.toMatchObject({ code: "inventory.itemConfigurationHasStock", statusCode: 409 });

    expect(execute).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
  });
});
