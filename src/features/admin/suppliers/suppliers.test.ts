import Fastify from "fastify";
import zodSchemaPlugin from "@core/plugins/zodSchema.plugin";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adminSuppliersRoutes } from "./suppliers.routes";
import {
  assignItemBodySchema,
  costBodySchema,
  listQuerySchema,
  presentationInputSchema,
  updateSupplierBodySchema,
} from "./suppliers.schemas";

const servers: Array<ReturnType<typeof Fastify>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("global supplier catalog contracts", () => {
  it("defaults listing to active suppliers and twenty rows", () => {
    expect(listQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20, status: "active" });
  });

  it("allows an organization admin to read and create suppliers without a global user role", async () => {
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
    const hasPermission = vi.fn().mockResolvedValue({ success: true });
    const server = Fastify();
    servers.push(server);
    await server.register(zodSchemaPlugin);
    server.decorate("admin", { suppliers: { list, create } } as unknown as typeof server.admin);
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

    expect(response.statusCode).toBe(200);
    expect(createResponse.statusCode).toBe(201);
    expect(list).toHaveBeenCalledWith({ page: 1, pageSize: 20, status: "active" });
    expect(create).toHaveBeenCalledWith({ name: "Nuevo proveedor" });
    expect(hasPermission).toHaveBeenCalledWith(
      expect.objectContaining({ body: { permissions: { suppliers: ["create"] } } }),
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
});
