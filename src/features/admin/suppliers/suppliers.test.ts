import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { requireGlobalSupplierManager } from "./suppliers.access";
import {
  assignItemBodySchema,
  costBodySchema,
  listQuerySchema,
  presentationInputSchema,
  updateSupplierBodySchema,
} from "./suppliers.schemas";

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

describe("global supplier catalog contracts", () => {
  it("allows global owners and admins but rejects membership-only roles", async () => {
    await expect(requireGlobalSupplierManager(requestWithRole("owner"))).resolves.toBeUndefined();
    await expect(requireGlobalSupplierManager(requestWithRole("admin"))).resolves.toBeUndefined();
    await expect(requireGlobalSupplierManager(requestWithRole("member"))).rejects.toMatchObject({
      code: "supplier.globalManagerRequired",
      statusCode: 403,
    });
    await expect(requireGlobalSupplierManager(requestWithRole("barista"))).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("defaults listing to active suppliers and twenty rows", () => {
    expect(listQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20, status: "active" });
  });

  it("requires at least one supplier field on update", () => {
    expect(updateSupplierBodySchema.parse({ email: null })).toEqual({ email: null });
    expect(() => updateSupplierBodySchema.parse({})).toThrow();
  });

  it("validates a first presentation and positive MXN cost", () => {
    expect(
      assignItemBodySchema.parse({
        itemType: "ingredient",
        itemId: "ingredient-1",
        presentation: {
          name: "Caja de 12",
          contentQuantity: 12,
          priceCents: 4200,
        },
      }),
    ).toMatchObject({ itemType: "ingredient", itemId: "ingredient-1" });
    expect(() => presentationInputSchema.parse({ name: "Caja", contentQuantity: 0, priceCents: 1 })).toThrow();
    expect(() => presentationInputSchema.parse({ name: "Caja", contentQuantity: 1.0000001, priceCents: 1 })).toThrow();
    expect(() => costBodySchema.parse({ priceCents: 0 })).toThrow();
  });
});
