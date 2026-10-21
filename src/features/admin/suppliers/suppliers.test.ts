import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import zodSchemaPlugin from "@core/plugins/zodSchema.plugin";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adminSuppliersRoutes } from "./suppliers.routes";
import {
  assignItemBodySchema,
  costBodySchema,
  listQuerySchema,
  presentationInputSchema,
  updatePresentationBodySchema,
  updateSupplierBodySchema,
} from "./suppliers.schemas";
import { adminSuppliersService } from "./suppliers.service";

const servers: Array<ReturnType<typeof Fastify>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("global supplier catalog contracts", () => {
  it("defaults listing to active suppliers and twenty rows", () => {
    expect(listQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20, status: "active" });
  });

  it("allows an organization admin to manage suppliers without a global user role", async () => {
    const list = vi.fn().mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
    });
    const createdSupplier = {
      id: "supplier-new",
      name: "Nuevo proveedor",
      email: null,
      phone: null,
      status: "active",
      ingredientCount: 0,
      supplyCount: 0,
      createdAt: new Date("2026-09-06T12:00:00.000Z"),
      updatedAt: new Date("2026-09-06T12:00:00.000Z"),
    };
    const create = vi.fn().mockResolvedValue(createdSupplier);
    const updatedPresentation = {
      id: "presentation-1",
      name: "Caja corregida",
      contentQuantity: 24,
      isDefault: true,
      canDelete: true,
      status: "active",
      currentCost: null,
      createdAt: new Date("2026-09-06T12:00:00.000Z"),
      updatedAt: new Date("2026-09-09T12:00:00.000Z"),
    };
    const updatePresentation = vi.fn().mockResolvedValue(updatedPresentation);
    const hasPermission = vi.fn().mockResolvedValue({ success: true });
    const server = Fastify();
    servers.push(server);
    await server.register(zodSchemaPlugin);
    server.decorate("admin", {
      suppliers: { list, create, updatePresentation },
    } as unknown as typeof server.admin);
    server.decorate("auth", {
      api: {
        getSession: vi.fn().mockResolvedValue({
          session: { activeOrganizationId: "org-active" },
          user: { id: "customer-with-admin-membership", role: "customer" },
        }),
        hasPermission,
      },
    } as unknown as typeof server.auth);
    server.decorate("db", {
      query: {
        memberDB: {
          findFirst: vi.fn().mockResolvedValue({
            id: "member-admin",
            userId: "customer-with-admin-membership",
            organizationId: "org-active",
            role: "admin",
          }),
        },
        organizationDB: {
          findFirst: vi.fn().mockResolvedValue({ id: "org-active" }),
        },
      },
    } as unknown as typeof server.db);
    await server.register(adminSuppliersRoutes, { prefix: "/suppliers" });
    await server.ready();

    const response = await server.inject({ method: "GET", url: "/suppliers" });
    const createResponse = await server.inject({
      method: "POST",
      url: "/suppliers",
      payload: { name: "Nuevo proveedor" },
    });
    const updatePresentationResponse = await server.inject({
      method: "PATCH",
      url: "/suppliers/supplier-new/items/item-1/presentations/presentation-1",
      payload: { name: "Caja corregida", contentQuantity: 24 },
    });
    const renamePresentationResponse = await server.inject({
      method: "PATCH",
      url: "/suppliers/supplier-new/items/item-1/presentations/presentation-1",
      payload: { name: "Caja renombrada" },
    });

    expect(response.statusCode).toBe(200);
    expect(createResponse.statusCode).toBe(201);
    expect(updatePresentationResponse.statusCode).toBe(200);
    expect(renamePresentationResponse.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith({ page: 1, pageSize: 20, status: "active" });
    expect(create).toHaveBeenCalledWith({ name: "Nuevo proveedor" });
    expect(updatePresentation).toHaveBeenCalledWith("supplier-new", "item-1", "presentation-1", {
      name: "Caja corregida",
      contentQuantity: 24,
    });
    expect(updatePresentation).toHaveBeenCalledWith("supplier-new", "item-1", "presentation-1", {
      name: "Caja renombrada",
    });
    expect(hasPermission).toHaveBeenCalledWith(
      expect.objectContaining({ body: { permissions: { suppliers: ["create"] } } }),
    );
    expect(hasPermission).toHaveBeenCalledWith(
      expect.objectContaining({ body: { permissions: { suppliers: ["update"] } } }),
    );
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
    expect(() =>
      presentationInputSchema.parse({ name: "Caja", contentQuantity: 0, priceCents: 1 }),
    ).toThrow();
    expect(() =>
      presentationInputSchema.parse({ name: "Caja", contentQuantity: 1.0000001, priceCents: 1 }),
    ).toThrow();
    expect(() => costBodySchema.parse({ priceCents: 0 })).toThrow();
  });

  it("validates partial presentation corrections", () => {
    expect(updatePresentationBodySchema.parse({ name: "Caja corregida" })).toEqual({
      name: "Caja corregida",
    });
    expect(updatePresentationBodySchema.parse({ contentQuantity: 24 })).toEqual({
      contentQuantity: 24,
    });
    expect(() => updatePresentationBodySchema.parse({})).toThrow();
    expect(() => updatePresentationBodySchema.parse({ contentQuantity: 0 })).toThrow();
  });

  it("rejects changing the content of a presentation used by a purchase order", async () => {
    const now = new Date("2026-09-24T12:00:00.000Z");
    const results = [
      [
        {
          id: "supplier-1",
          name: "Proveedor",
          email: null,
          phone: null,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
          ingredientCount: 1,
          supplyCount: 0,
        },
      ],
      [{ id: "item-1", ingredientId: "ingredient-1", itemId: "ingredient-1" }],
      [{ id: "item-1", ingredientId: "ingredient-1", itemId: "ingredient-1" }],
      [{ id: "presentation-1", contentQuantity: 12 }],
      [{ id: "order-line-1" }],
    ];
    const update = vi.fn();
    const select = vi.fn(() => {
      const rows = results.shift() ?? [];
      const query = {
        from: vi.fn(),
        leftJoin: vi.fn(),
        innerJoin: vi.fn(),
        where: vi.fn(),
        limit: vi.fn().mockResolvedValue(rows),
      };
      query.from.mockReturnValue(query);
      query.leftJoin.mockReturnValue(query);
      query.innerJoin.mockReturnValue(query);
      query.where.mockReturnValue(query);
      return query;
    });
    const fastify = { db: { select, update } } as unknown as FastifyInstance;

    await expect(
      adminSuppliersService(fastify).updatePresentation("supplier-1", "item-1", "presentation-1", {
        name: "Nuevo nombre",
        contentQuantity: 24,
      }),
    ).rejects.toMatchObject({ code: "supplier.presentationContentInUse", statusCode: 409 });
    expect(update).not.toHaveBeenCalled();
    expect(select).toHaveBeenCalledTimes(5);
  });
});
