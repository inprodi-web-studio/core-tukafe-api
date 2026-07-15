import type { FastifyReply, FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
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
});
