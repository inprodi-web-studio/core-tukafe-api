import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { requireGlobalOwner } from "./apiKeys.routes";

function requestWithRole(role: string) {
  return {
    auth: { user: { id: "viewer" } },
    server: {
      db: {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ role }]) })),
          })),
        })),
      },
    },
  } as unknown as FastifyRequest;
}

describe("global API key authorization", () => {
  it("allows only the global owner role", async () => {
    await expect(requireGlobalOwner(requestWithRole("owner"))).resolves.toBeUndefined();
    await expect(requireGlobalOwner(requestWithRole("admin"))).rejects.toMatchObject({
      code: "apiKey.globalOwnerRequired",
      statusCode: 403,
    });
    await expect(requireGlobalOwner(requestWithRole("member"))).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});
