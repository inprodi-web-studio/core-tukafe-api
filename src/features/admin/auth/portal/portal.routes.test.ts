import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import zodSchemaPlugin from "../../../../core/plugins/zodSchema.plugin";
import { adminAuthRoutes } from "../auth.routes";
import type { AdminAuthService, PortalSession } from "../auth.types";

const portalSession: PortalSession = {
  user: {
    id: "user-admin",
    email: "admin@tukafe.test",
    name: "Admin",
    middleName: null,
    lastName: null,
    role: "owner",
  },
  activeOrganization: {
    id: "org-owner",
    name: "Landmark",
    slug: "landmark",
    role: "owner",
  },
  organizations: [
    {
      id: "org-owner",
      name: "Landmark",
      slug: "landmark",
      role: "owner",
    },
  ],
};

const servers: Array<ReturnType<typeof Fastify>> = [];

async function createServer() {
  const service: AdminAuthService = {
    loginWithEmail: vi.fn().mockResolvedValue({
      user: portalSession.user,
      cookie: "tukafe.session=legacy",
      organizationId: "org-barista",
    }),
    loginToPortal: vi.fn().mockResolvedValue({
      session: portalSession,
      cookie: "tukafe.session=portal",
    }),
    getPortalSession: vi.fn().mockResolvedValue(portalSession),
    setPortalActiveOrganization: vi.fn().mockResolvedValue({
      session: portalSession,
      cookie: "tukafe.session=switched",
    }),
  };
  const server = Fastify();
  servers.push(server);
  await server.register(zodSchemaPlugin);
  server.decorate("admin", { auth: service } as unknown as typeof server.admin);
  await server.register(adminAuthRoutes, { prefix: "/auth" });
  await server.ready();

  return { server, service };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("portal auth routes", () => {
  it("expone login, sesión y cambio de organización del portal", async () => {
    const { server, service } = await createServer();
    const login = await server.inject({
      method: "POST",
      url: "/auth/portal/login",
      payload: { email: "admin@tukafe.test", password: "secret" },
    });
    const session = await server.inject({ method: "GET", url: "/auth/portal/session" });
    const organization = await server.inject({
      method: "PUT",
      url: "/auth/portal/active-organization",
      payload: { organizationId: "org-owner" },
    });

    expect(login.statusCode).toBe(200);
    expect(login.headers["set-cookie"]).toContain("tukafe.session=portal");
    expect(login.json()).toEqual(portalSession);
    expect(session.statusCode).toBe(200);
    expect(organization.statusCode).toBe(200);
    expect(service.setPortalActiveOrganization).toHaveBeenCalledWith(
      { organizationId: "org-owner" },
      expect.any(Object),
    );
  });

  it("preserva el contrato de login que utiliza In Place", async () => {
    const { server, service } = await createServer();
    const response = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "barista@tukafe.test",
        password: "secret",
        organizationId: "org-barista",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().organizationId).toBe("org-barista");
    expect(service.loginWithEmail).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-barista" }),
      expect.any(Object),
    );
  });

  it("rechaza payloads incompletos antes de invocar el servicio", async () => {
    const { server, service } = await createServer();
    const response = await server.inject({
      method: "POST",
      url: "/auth/portal/login",
      payload: { email: "not-an-email" },
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(service.loginToPortal).not.toHaveBeenCalled();
  });
});
