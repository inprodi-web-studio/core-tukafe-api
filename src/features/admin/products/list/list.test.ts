import type { FastifyReply, FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { collectCategoryAndDescendantIds } from "../products.service";
import { list } from "./list.controllers";
import { listQuerySchema } from "./list.schemas";

describe("admin product list contract", () => {
  it("normaliza los defaults del data grid", () => {
    expect(listQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 30,
      sortBy: "name",
      sortDirection: "asc",
    });
  });

  it("rechaza filtros y ordenamientos desconocidos", () => {
    expect(() => listQuerySchema.parse({ organizationId: "org-other" })).toThrow();
    expect(() => listQuerySchema.parse({ sortBy: "deletedAt" })).toThrow();
  });

  it("incluye descendientes al filtrar una categoría", () => {
    const categoryIds = collectCategoryAndDescendantIds(
      [
        { id: "coffee", parentId: null },
        { id: "hot", parentId: "coffee" },
        { id: "seasonal", parentId: "hot" },
        { id: "food", parentId: null },
      ],
      "coffee",
    );

    expect(categoryIds).toEqual(["coffee", "hot", "seasonal"]);
  });

  it("toma la organización activa del contexto autenticado", async () => {
    const listProducts = vi.fn().mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 30, totalItems: 0, totalPages: 0 },
    });
    const request = {
      query: listQuerySchema.parse({ search: "latte" }),
      auth: { member: { organizationId: "org-active" } },
      server: { admin: { products: { list: listProducts } } },
    } as unknown as FastifyRequest<{
      Querystring: ReturnType<typeof listQuerySchema.parse>;
    }>;
    const send = vi.fn();
    const reply = {
      status: vi.fn().mockReturnValue({ send }),
    } as unknown as FastifyReply;

    await list(request, reply);

    expect(listProducts).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-active", search: "latte" }),
    );
    expect(send).toHaveBeenCalledOnce();
  });
});
