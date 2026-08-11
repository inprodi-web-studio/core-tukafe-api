import {
  memberDB,
  notificationCampaignsDB,
  organizationDB,
  sessionDB,
  workOrdersDB,
} from "@core/db/schemas";
import type { FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { adminOrganizationsService } from "./organizations.service";

const organizationRow = {
  id: "org-north",
  name: "Norte",
  slug: "norte",
  logo: "/north.webp",
  metadata: null,
  address: "Av. Norte 10",
  latitude: null,
  longitude: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  deletedAt: null,
};

describe("admin organizations service", () => {
  it("creates the organization and owner membership transactionally", async () => {
    const inserts: unknown[] = [];
    const tx = {
      insert: vi.fn(() => ({
        values: vi.fn((value: unknown) => {
          inserts.push(value);
          return { returning: vi.fn().mockResolvedValue([organizationRow]) };
        }),
      })),
    };
    const fastify = {
      db: {
        query: {
          uploadsDB: {
            findFirst: vi.fn().mockResolvedValue({
              id: "upload-logo",
              path: "/north.webp",
              visibility: "PUBLIC",
              mimeType: "image/webp",
            }),
          },
        },
        transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
      },
    } as unknown as FastifyInstance;

    const created = await adminOrganizationsService(fastify).create({
      creatorUserId: "user-owner",
      name: "Norte",
      slug: "norte",
      address: "Av. Norte 10",
      logoUploadId: "upload-logo",
    });

    expect(created).toMatchObject({ id: "org-north", status: "active", logo: "/north.webp" });
    expect(inserts).toHaveLength(2);
    expect(inserts[1]).toMatchObject({ userId: "user-owner", role: "owner" });
  });

  it("rejects private logo uploads", async () => {
    const fastify = {
      db: {
        query: {
          uploadsDB: {
            findFirst: vi.fn().mockResolvedValue({
              id: "private-logo",
              path: "/private.webp",
              visibility: "PRIVATE",
              mimeType: "image/webp",
            }),
          },
        },
      },
    } as unknown as FastifyInstance;

    await expect(
      adminOrganizationsService(fastify).create({
        creatorUserId: "owner",
        name: "Norte",
        slug: "norte",
        address: "Norte",
        logoUploadId: "private-logo",
      }),
    ).rejects.toMatchObject({ code: "organization.logoMustBePublic", statusCode: 422 });
  });

  it("blocks deactivation and reports pending operational counts", async () => {
    let organizationSelects = 0;
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => {
          if (table === organizationDB) {
            organizationSelects += 1;
            if (organizationSelects === 1) {
              return {
                where: vi.fn(() => ({
                  limit: vi.fn().mockResolvedValue([{ id: "org-north", deletedAt: null }]),
                })),
              };
            }
            return { where: vi.fn().mockResolvedValue([{ value: 2 }]) };
          }
          if (table === workOrdersDB) {
            return { where: vi.fn().mockResolvedValue([{ orders: 2, workOrders: 4 }]) };
          }
          if (table === notificationCampaignsDB) {
            return { where: vi.fn().mockResolvedValue([{ value: 1 }]) };
          }
          throw new Error("Unexpected table");
        }),
      })),
    };
    const fastify = {
      db: { transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)) },
    } as unknown as FastifyInstance;

    await expect(
      adminOrganizationsService(fastify).deactivate({
        organizationId: "org-north",
        actorUserId: "owner",
        activeOrganizationId: "org-other",
      }),
    ).rejects.toMatchObject({
      code: "organization.pendingOperations",
      statusCode: 409,
      data: { openOrders: 2, openWorkOrders: 4, pendingCampaigns: 1 },
    });
  });

  it("moves portal sessions and revokes operational sessions when deactivating", async () => {
    let organizationSelects = 0;
    const sessionUpdates: unknown[] = [];
    const deletedSessionIds: unknown[] = [];
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => {
          if (table === organizationDB) {
            organizationSelects += 1;
            if (organizationSelects === 1) {
              return {
                where: vi.fn(() => ({
                  limit: vi.fn().mockResolvedValue([{ id: "org-north", deletedAt: null }]),
                })),
              };
            }
            return { where: vi.fn().mockResolvedValue([{ value: 2 }]) };
          }
          if (table === workOrdersDB) {
            return { where: vi.fn().mockResolvedValue([{ orders: 0, workOrders: 0 }]) };
          }
          if (table === notificationCampaignsDB) {
            return { where: vi.fn().mockResolvedValue([{ value: 0 }]) };
          }
          if (table === memberDB) {
            return {
              innerJoin: vi.fn(() => ({
                where: vi.fn(() => ({
                  orderBy: vi.fn(() => ({
                    limit: vi.fn().mockResolvedValue([{ id: "org-alternative" }]),
                  })),
                })),
              })),
            };
          }
          if (table === sessionDB) {
            return {
              leftJoin: vi.fn(() => ({
                where: vi.fn().mockResolvedValue([
                  { id: "session-owner", userId: "owner", role: "owner" },
                  { id: "session-barista", userId: "barista", role: "barista" },
                ]),
              })),
            };
          }
          throw new Error("Unexpected table");
        }),
      })),
      update: vi.fn((table: unknown) => ({
        set: vi.fn((value: unknown) => ({
          where: vi.fn(() => {
            if (table === sessionDB) sessionUpdates.push(value);
          }),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn((value: unknown) => deletedSessionIds.push(value)),
      })),
    };
    const fastify = {
      db: { transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)) },
    } as unknown as FastifyInstance;

    await adminOrganizationsService(fastify).deactivate({
      organizationId: "org-north",
      actorUserId: "owner",
      activeOrganizationId: "org-north",
    });

    expect(sessionUpdates).toEqual([
      expect.objectContaining({ activeOrganizationId: "org-alternative" }),
    ]);
    expect(deletedSessionIds).toHaveLength(1);
    expect(tx.update).toHaveBeenCalledWith(organizationDB);
  });
});
