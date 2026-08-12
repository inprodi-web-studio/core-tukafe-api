import type { FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { adminApiKeysService } from "./apiKeys.service";

describe("admin API keys service", () => {
  it("creates a user-owned key through Better Auth and returns the secret once", async () => {
    const createApiKey = vi.fn().mockResolvedValue({
      id: "key-1",
      name: "Barra",
      prefix: "guest_",
      start: "guest_",
      key: "guest_secret",
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    });
    const fastify = { auth: { api: { createApiKey } } } as unknown as FastifyInstance;

    const created = await adminApiKeysService(fastify).create(
      { name: "Barra", expiresInSeconds: 2_592_000 },
      { cookie: "session=value" },
    );

    expect(createApiKey).toHaveBeenCalledWith({
      headers: { cookie: "session=value" },
      body: { name: "Barra", expiresIn: 2_592_000 },
    });
    expect(created).toMatchObject({ key: "guest_secret", expiresAt: "2027-01-01T00:00:00.000Z" });
  });

  it("revokes an existing key without deleting it", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "key-1" }]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const update = vi.fn(() => ({ set }));
    const fastify = { db: { update } } as unknown as FastifyInstance;

    await expect(adminApiKeysService(fastify).revoke("key-1")).resolves.toBeUndefined();
    expect(set).toHaveBeenCalledWith({ enabled: false });
  });

  it("reports a missing key when revocation cannot update a row", async () => {
    const fastify = {
      db: {
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })),
          })),
        })),
      },
    } as unknown as FastifyInstance;

    await expect(adminApiKeysService(fastify).revoke("missing")).rejects.toMatchObject({
      code: "apiKey.notFound",
      statusCode: 404,
    });
  });
});
