import Fastify from "fastify";
import zodSchemaPlugin from "@core/plugins/zodSchema.plugin";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adminOrganizationsRoutes } from "./organizations.routes";

const servers: Array<ReturnType<typeof Fastify>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function buildServer(role: "owner" | "admin" | "member") {
  const list = vi.fn().mockResolvedValue({
    data: [],
    pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
  });
  const server = Fastify();
  servers.push(server);
  await server.register(zodSchemaPlugin);
  server.decorate("admin", {
    organizations: { list },
  } as unknown as typeof server.admin);
  server.decorate("auth", {
    api: {
      getSession: vi.fn().mockResolvedValue({
        session: { activeOrganizationId: "org-active" },
        user: { id: "user-1", role: "customer" },
      }),
    },
  } as unknown as typeof server.auth);
  server.decorate("db", {
    query: {
      memberDB: {
        findFirst: vi.fn().mockResolvedValue({
          id: "member-1",
          userId: "user-1",
          organizationId: "org-active",
          role,
        }),
      },
      organizationDB: {
        findFirst: vi.fn().mockResolvedValue({ id: "org-active" }),
      },
    },
  } as unknown as typeof server.db);
  await server.register(adminOrganizationsRoutes, { prefix: "/organizations" });
  await server.ready();
  return { server, list };
}

describe("organization management authorization", () => {
  it.each(["owner", "admin"] as const)(
    "allows an active organization %s to manage branches",
    async (role) => {
      const { server, list } = await buildServer(role);

      const response = await server.inject({ method: "GET", url: "/organizations" });

      expect(response.statusCode).toBe(200);
      expect(list).toHaveBeenCalledWith({ page: 1, pageSize: 20, status: "all" });
    },
  );

  it("rejects a non-administrative member", async () => {
    const { server, list } = await buildServer("member");

    const response = await server.inject({ method: "GET", url: "/organizations" });

    expect(response.statusCode).toBe(403);
    expect(list).not.toHaveBeenCalled();
  });
});
