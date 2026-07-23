import type { FastifyReply, FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { updateCategories } from "./updateCategories/updateCategories.controllers";
import { bodySchema as categoriesBodySchema } from "./updateCategories/updateCategories.schemas";
import { updateFeatured } from "./updateFeatured/updateFeatured.controllers";
import { bodySchema as featuredBodySchema } from "./updateFeatured/updateFeatured.schemas";
import { updateOrganizationStatus } from "./updateOrganizationStatus/updateOrganizationStatus.controllers";
import { bodySchema as organizationStatusBodySchema } from "./updateOrganizationStatus/updateOrganizationStatus.schemas";

function createReply() {
  const send = vi.fn();
  const reply = {
    status: vi.fn().mockReturnValue({ send }),
  } as unknown as FastifyReply;

  return { reply, send };
}

describe("admin product actions", () => {
  it("valida payloads booleanos estrictos", () => {
    expect(organizationStatusBodySchema.parse({ isActive: false })).toEqual({ isActive: false });
    expect(featuredBodySchema.parse({ isFeatured: true })).toEqual({ isFeatured: true });
    expect(() => organizationStatusBodySchema.parse({ isActive: "false" })).toThrow();
    expect(() => featuredBodySchema.parse({ isFeatured: "true" })).toThrow();
  });

  it("valida la reasignación de categorías y permite dejar el producto sin categoría", () => {
    const categoryId = "V1StGXR8_Z5jdHi6B-myT";

    expect(categoriesBodySchema.parse({ categoryIds: [categoryId] })).toEqual({
      categoryIds: [categoryId],
    });
    expect(categoriesBodySchema.parse({ categoryIds: [] })).toEqual({ categoryIds: [] });
    expect(() => categoriesBodySchema.parse({ categoryIds: ["invalid-id"] })).toThrow();
    expect(() =>
      categoriesBodySchema.parse({ categoryIds: [categoryId], organizationId: "org-other" }),
    ).toThrow();
  });

  it("inactiva usando exclusivamente la organización de la sesión", async () => {
    const update = vi.fn().mockResolvedValue({
      id: "product-id",
      organizationStatus: "inactive",
    });
    const request = {
      params: { productId: "product-id" },
      body: { isActive: false },
      auth: { member: { organizationId: "org-active" } },
      server: { admin: { products: { updateOrganizationStatus: update } } },
    } as unknown as FastifyRequest<{
      Params: { productId: string };
      Body: { isActive: boolean };
    }>;
    const { reply, send } = createReply();

    await updateOrganizationStatus(request, reply);

    expect(update).toHaveBeenCalledWith("product-id", "org-active", false);
    expect(send).toHaveBeenCalledWith({ id: "product-id", organizationStatus: "inactive" });
  });

  it("marca el producto como destacado", async () => {
    const update = vi.fn().mockResolvedValue({ id: "product-id", isFeatured: true });
    const request = {
      params: { productId: "product-id" },
      body: { isFeatured: true },
      server: { admin: { products: { updateFeatured: update } } },
    } as unknown as FastifyRequest<{
      Params: { productId: string };
      Body: { isFeatured: boolean };
    }>;
    const { reply, send } = createReply();

    await updateFeatured(request, reply);

    expect(update).toHaveBeenCalledWith("product-id", true);
    expect(send).toHaveBeenCalledWith({ id: "product-id", isFeatured: true });
  });

  it("reemplaza las categorías del producto", async () => {
    const categoryIds = ["V1StGXR8_Z5jdHi6B-myT", "Uakgb_J5m9g-0JDMbcJqL"];
    const update = vi.fn().mockResolvedValue({
      id: "product-id",
      categories: categoryIds.map((id) => ({ id, name: id, color: "#83987e" })),
    });
    const request = {
      params: { productId: "product-id" },
      body: { categoryIds },
      server: { admin: { products: { updateCategories: update } } },
    } as unknown as FastifyRequest<{
      Params: { productId: string };
      Body: { categoryIds: string[] };
    }>;
    const { reply, send } = createReply();

    await updateCategories(request, reply);

    expect(update).toHaveBeenCalledWith("product-id", { categoryIds });
    expect(send).toHaveBeenCalledWith({
      id: "product-id",
      categories: categoryIds.map((id) => ({ id, name: id, color: "#83987e" })),
    });
  });
});
