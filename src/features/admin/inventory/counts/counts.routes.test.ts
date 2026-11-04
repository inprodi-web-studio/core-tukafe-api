import Fastify from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { describe, expect, it, vi } from "vitest";
import { adminInventoryCountsRoutes } from "./counts.routes";

async function serverFor(role: string, authenticated = true, permitted = true) {
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  const doc = {
    id: "count",
    locationId: "loc",
    status: "draft",
    version: 1,
    observations: null,
    createdAt: "2026-11-04T12:00:00.000Z",
    updatedAt: "2026-11-04T12:00:00.000Z",
    appliedAt: null,
    cancelledAt: null,
    appliedBy: null,
    cancelledBy: null,
    movementId: null,
    createdBy: { id: "user", name: "Admin" },
    items: [],
  };
  const create = vi.fn().mockResolvedValue(doc);
  const hasPermission = vi.fn().mockResolvedValue({ success: permitted });
  app.decorate("auth", {
    api: {
      getSession: vi.fn().mockResolvedValue(
        authenticated
          ? {
              user: { id: "user", role: "customer" },
              session: { activeOrganizationId: "branch" },
            }
          : null,
      ),
      hasPermission,
    },
  } as unknown as typeof app.auth);
  app.decorate("db", {
    query: {
      memberDB: {
        findFirst: vi.fn().mockResolvedValue({ id: "member", role, organizationId: "branch" }),
      },
      organizationDB: { findFirst: vi.fn().mockResolvedValue({ id: "branch" }) },
    },
  } as unknown as typeof app.db);
  app.decorate("admin", { inventoryCounts: { create, get: vi.fn().mockResolvedValue(doc) } } as unknown as typeof app.admin);
  await app.register(adminInventoryCountsRoutes, { prefix: "/inventory" });
  return { app, create, hasPermission };
}
describe("physical count HTTP authorization", () => {
  it.each(["owner", "admin"])(
    "allows membership %s despite the global customer role",
    async (role) => {
      const { app, create, hasPermission } = await serverFor(role);
      try {
        const result = await app.inject({
          method: "POST",
          url: "/inventory/locations/loc/counts",
          payload: {},
        });
        expect(result.statusCode).toBe(201);
        expect(create).toHaveBeenCalledWith({
          userId: "user",
          organizationId: "branch",
          locationId: "loc",
        });
        expect(hasPermission).toHaveBeenCalledWith(
          expect.objectContaining({ body: { permissions: { inventory: ["adjust"] } } }),
        );
      } finally {
        await app.close();
      }
    },
  );
  it.each(["member", "barista"])(
    "rejects membership %s before entering the service",
    async (role) => {
      const { app, create } = await serverFor(role);
      try {
        expect(
          (
            await app.inject({
              method: "POST",
              url: "/inventory/locations/loc/counts",
              payload: {},
            })
          ).statusCode,
        ).toBe(403);
        expect(create).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    },
  );
  it("rejects unauthenticated and unauthorized requests", async () => {
    for (const [authenticated, permitted, expected] of [
      [false, true, 401],
      [true, false, 403],
    ] as const) {
      const { app, create } = await serverFor("admin", authenticated, permitted);
      try {
        expect(
          (
            await app.inject({
              method: "POST",
              url: "/inventory/locations/loc/counts",
              payload: {},
            })
          ).statusCode,
        ).toBe(expected);
        expect(create).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    }
  });
  it("rejects references and backdated fields in the HTTP contract", async () => {
    const { app, create } = await serverFor("admin");
    try {
      const result = await app.inject({
        method: "POST",
        url: "/inventory/locations/loc/counts",
        payload: { reference: "external", appliedAt: "2020-01-01" },
      });
      expect(result.statusCode).toBe(400);
      expect(create).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
