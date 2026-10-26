import Fastify from "fastify";
import zodSchemaPlugin from "@core/plugins/zodSchema.plugin";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adminProductcategoriesRoutes } from "./productCategories.routes";
import { adminProductcategoriesService } from "./productCategories.service";

const servers: Array<ReturnType<typeof Fastify>> = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function buildServer(role: string | null, permission = true) {
  const server = Fastify();
  servers.push(server);
  await server.register(zodSchemaPlugin);
  const updateOrganizationStatus = vi.fn().mockResolvedValue(undefined);
  server.decorate("admin", {
    productCategories: { updateOrganizationStatus },
  } as unknown as typeof server.admin);
  server.decorate("auth", {
    api: {
      getSession: vi.fn().mockResolvedValue(
        role
          ? {
              session: { activeOrganizationId: "branch-a" },
              user: { id: "user-a", role: "customer" },
            }
          : null,
      ),
      hasPermission: vi.fn().mockResolvedValue({ success: permission }),
    },
  } as unknown as typeof server.auth);
  server.decorate("db", {
    query: {
      memberDB: { findFirst: vi.fn().mockResolvedValue({ role, organizationId: "branch-a" }) },
      organizationDB: { findFirst: vi.fn().mockResolvedValue({ id: "branch-a" }) },
    },
  } as unknown as typeof server.db);
  await server.register(adminProductcategoriesRoutes, { prefix: "/categories" });
  return { server, updateOrganizationStatus };
}

describe("category status authorization", () => {
  it.each(["owner", "admin"])(
    "allows %s and takes the branch only from the session",
    async (role) => {
      const { server, updateOrganizationStatus } = await buildServer(role);
      const response = await server.inject({
        method: "PATCH",
        url: "/categories/coffee/organization-status",
        payload: { isActive: false },
      });
      expect(response.statusCode).toBe(204);
      expect(updateOrganizationStatus).toHaveBeenCalledWith("coffee", "branch-a", false);
    },
  );
  it.each(["member", "barista", null])("rejects %s", async (role) => {
    const { server, updateOrganizationStatus } = await buildServer(role);
    const response = await server.inject({
      method: "PATCH",
      url: "/categories/coffee/organization-status",
      payload: { isActive: false },
    });
    expect(response.statusCode).toBe(role ? 403 : 401);
    expect(updateOrganizationStatus).not.toHaveBeenCalled();
  });
  it("rejects missing update permission and organization spoofing", async () => {
    const denied = await buildServer("admin", false);
    expect(
      (
        await denied.server.inject({
          method: "PATCH",
          url: "/categories/coffee/organization-status",
          payload: { isActive: true },
        })
      ).statusCode,
    ).toBe(403);
    const allowed = await buildServer("admin");
    expect(
      (
        await allowed.server.inject({
          method: "PATCH",
          url: "/categories/coffee/organization-status",
          payload: { isActive: false, organizationId: "branch-b" },
        })
      ).statusCode,
    ).toBe(400);
    expect(allowed.updateOrganizationStatus).not.toHaveBeenCalled();
  });
  it("upserts only the requested category, preserving descendant settings", async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const get = vi.fn().mockResolvedValue({ id: "coffee" });
    const fastify = {
      db: { insert: vi.fn().mockReturnValue({ values }) },
      admin: { productCategories: { get } },
    } as unknown as Parameters<typeof adminProductcategoriesService>[0];
    await adminProductcategoriesService(fastify).updateOrganizationStatus(
      "coffee",
      "branch-a",
      false,
    );
    expect(get).toHaveBeenCalledWith("coffee");
    expect(values).toHaveBeenCalledWith({
      categoryId: "coffee",
      organizationId: "branch-a",
      isActive: false,
    });
    expect(fastify.db.insert).toHaveBeenCalledTimes(1);
  });
  it("does not write when the category is missing", async () => {
    const insert = vi.fn();
    const fastify = {
      db: { insert },
      admin: {
        productCategories: {
          get: vi.fn().mockRejectedValue({ code: "productCategory.notFound" }),
        },
      },
    } as unknown as Parameters<typeof adminProductcategoriesService>[0];
    await expect(
      adminProductcategoriesService(fastify).updateOrganizationStatus("missing", "branch-a", false),
    ).rejects.toMatchObject({ code: "productCategory.notFound" });
    expect(insert).not.toHaveBeenCalled();
  });
});
