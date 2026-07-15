import type { FastifyReply, FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import adminAuthHandler from "./adminAuth.handler";

function createRequest(role: string | null, hasSession = true) {
  const member = role
    ? {
        id: `member-${role}`,
        userId: "user-1",
        organizationId: "org-1",
        role,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    : null;
  const getSession = vi.fn().mockResolvedValue(
    hasSession
      ? {
          user: { id: "user-1", name: "Admin", email: "admin@tukafe.test" },
          session: { id: "session-1", activeOrganizationId: "org-1" },
        }
      : null,
  );
  const hasPermission = vi.fn().mockResolvedValue({ success: true });
  const findFirst = vi.fn().mockResolvedValue(member);
  const request = {
    headers: {},
    server: {
      auth: { api: { getSession, hasPermission } },
      db: { query: { memberDB: { findFirst } } },
    },
  } as unknown as FastifyRequest;

  return { request, getSession, hasPermission };
}

const reply = {} as FastifyReply;

describe("adminAuthHandler role restrictions", () => {
  it.each(["owner", "admin"])("permite el rol %s", async (role) => {
    const { request, hasPermission } = createRequest(role);
    const handler = adminAuthHandler({
      roles: ["owner", "admin"],
      permissions: { products: ["read"] },
    });

    await handler(request, reply);

    expect(request.auth.member.role).toBe(role);
    expect(hasPermission).toHaveBeenCalledOnce();
  });

  it.each(["member", "barista"])("rechaza el rol %s", async (role) => {
    const { request, hasPermission } = createRequest(role);
    const handler = adminAuthHandler({
      roles: ["owner", "admin"],
      permissions: { products: ["read"] },
    });

    await expect(handler(request, reply)).rejects.toMatchObject({
      code: "auth.portalAccessDenied",
      statusCode: 403,
    });
    expect(hasPermission).not.toHaveBeenCalled();
  });

  it("rechaza una solicitud sin sesión", async () => {
    const { request } = createRequest(null, false);
    const handler = adminAuthHandler({ roles: ["owner", "admin"] });

    await expect(handler(request, reply)).rejects.toMatchObject({
      code: "auth.noSession",
      statusCode: 401,
    });
  });
});
