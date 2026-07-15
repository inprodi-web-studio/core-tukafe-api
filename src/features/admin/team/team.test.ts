import { accountDB, memberDB, userDB } from "@core/db/schemas";
import { verifyPassword } from "better-auth/crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { createTeamMember, listTeam } from "./team.controllers";
import { createBodySchema, listQuerySchema } from "./team.schemas";
import { adminTeamService } from "./team.service";
import type { CreateTeamMemberParams } from "./team.types";

function createReply() {
  const send = vi.fn();
  const reply = {
    status: vi.fn().mockReturnValue({ send }),
  } as unknown as FastifyReply;

  return { reply, send };
}

describe("admin team contract", () => {
  it("aplica defaults y restringe roles, contraseña y campos adicionales", () => {
    expect(listQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 30,
      sortBy: "name",
      sortDirection: "asc",
    });
    expect(
      createBodySchema.parse({
        name: " Ana ",
        surnames: " López ",
        email: "ANA@TUKAFE.TEST",
        password: "segura123",
        role: "admin",
        organizationIds: ["org-one", "org-two", "org-one"],
      }),
    ).toEqual({
      name: "Ana",
      surnames: "López",
      email: "ana@tukafe.test",
      password: "segura123",
      role: "admin",
      organizationIds: ["org-one", "org-two"],
    });

    expect(() =>
      createBodySchema.parse({
        name: "Ana",
        surnames: "López",
        email: "ana@tukafe.test",
        password: "corta",
        role: "owner",
        organizationIds: [],
      }),
    ).toThrow();
    expect(() => listQuerySchema.parse({ pageSize: 101 })).toThrow();
    expect(() => listQuerySchema.parse({ organizationId: "org-client" })).toThrow();
  });

  it("lista usando exclusivamente la organización autenticada", async () => {
    const list = vi.fn().mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 30, totalItems: 0, totalPages: 0 },
    });
    const request = {
      query: {
        page: 1,
        pageSize: 30,
        search: "ana",
        role: "admin",
        sortBy: "name",
        sortDirection: "asc",
      },
      auth: { member: { organizationId: "org-active" } },
      server: { admin: { team: { list } } },
    } as unknown as FastifyRequest;
    const { reply } = createReply();

    await listTeam(request as never, reply);

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-active",
        search: "ana",
        role: "admin",
      }),
    );
  });

  it("crea el alta dentro de una transacción con contraseña hasheada y rol de membresía", async () => {
    const inserted = new Map<unknown, unknown>();
    const transaction = vi.fn(async (callback: (tx: unknown) => unknown) => {
      const tx = {
        select: vi.fn(() => ({
          from: vi.fn((table: unknown) => ({
            where: vi.fn(() =>
              table === memberDB
                ? Promise.resolve([
                    { organizationId: "org-active" },
                    { organizationId: "org-secondary" },
                  ])
                : { limit: vi.fn().mockResolvedValue([]) },
            ),
          })),
        })),
        insert: vi.fn((table: unknown) => ({
          values: vi.fn((values: unknown) => {
            inserted.set(table, values);
            if (table === memberDB) {
              return {
                returning: vi
                  .fn()
                  .mockResolvedValue([{ id: "member-active", createdAt: new Date("2026-07-15") }]),
              };
            }
            return Promise.resolve();
          }),
        })),
      };

      return callback(tx);
    });
    const service = adminTeamService({ db: { transaction } } as unknown as FastifyInstance);

    const result = await service.create({
      creatorUserId: "user-creator",
      organizationIds: ["org-active", "org-secondary"],
      name: "  Luis   Alberto ",
      surnames: " Pérez   Soto ",
      email: " LUIS@TUKAFE.TEST ",
      password: "segura123",
      role: "barista",
    });

    expect(transaction).toHaveBeenCalledOnce();
    const insertedUser = inserted.get(userDB) as Record<string, unknown>;
    expect(insertedUser).toEqual(
      expect.objectContaining({
        name: "Luis Alberto",
        middleName: "Pérez Soto",
        email: "luis@tukafe.test",
        emailVerified: true,
      }),
    );
    expect(insertedUser).not.toHaveProperty("role");
    expect(inserted.get(memberDB)).toEqual([
      expect.objectContaining({ organizationId: "org-active", role: "barista" }),
      expect.objectContaining({ organizationId: "org-secondary", role: "barista" }),
    ]);

    const account = inserted.get(accountDB) as Record<string, unknown>;
    expect(account).toEqual(expect.objectContaining({ providerId: "credential" }));
    expect(account?.password).not.toBe("segura123");
    expect(
      await verifyPassword({
        hash: String(account?.password),
        password: "segura123",
      }),
    ).toBe(true);
    expect(result).toEqual(
      expect.objectContaining({
        name: "Luis Alberto",
        surnames: "Pérez Soto",
        email: "luis@tukafe.test",
        role: "barista",
      }),
    );
  });

  it("rechaza case-insensitive un correo global existente sin insertar registros", async () => {
    const insert = vi.fn();
    const transaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({
        select: vi.fn(() => ({
          from: vi.fn((table: unknown) => ({
            where: vi.fn(() =>
              table === memberDB
                ? Promise.resolve([{ organizationId: "org-active" }])
                : { limit: vi.fn().mockResolvedValue([{ id: "user-existing" }]) },
            ),
          })),
        })),
        insert,
      }),
    );
    const service = adminTeamService({ db: { transaction } } as unknown as FastifyInstance);
    const input: CreateTeamMemberParams = {
      creatorUserId: "user-creator",
      organizationIds: ["org-active"],
      name: "Ana",
      surnames: "López",
      email: "ANA@TUKAFE.TEST",
      password: "segura123",
      role: "admin",
    };

    await expect(service.create(input)).rejects.toMatchObject({
      code: "team.emailAlreadyExists",
      statusCode: 409,
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("rechaza sucursales donde el creador no tiene acceso administrativo", async () => {
    const insert = vi.fn();
    const transaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn().mockResolvedValue([{ organizationId: "org-active" }]),
          })),
        })),
        insert,
      }),
    );
    const service = adminTeamService({ db: { transaction } } as unknown as FastifyInstance);

    await expect(
      service.create({
        creatorUserId: "user-creator",
        organizationIds: ["org-active", "org-forbidden"],
        name: "Ana",
        surnames: "López",
        email: "ana@tukafe.test",
        password: "segura123",
        role: "admin",
      }),
    ).rejects.toMatchObject({
      code: "team.organizationAccessDenied",
      statusCode: 403,
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("crea mediante el controlador para las sucursales solicitadas", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "member-new",
      name: "Ana",
      surnames: "López",
      email: "ana@tukafe.test",
      role: "admin",
      createdAt: new Date("2026-07-15"),
    });
    const request = {
      body: {
        name: "Ana",
        surnames: "López",
        email: "ana@tukafe.test",
        password: "segura123",
        role: "admin",
        organizationIds: ["org-active", "org-secondary"],
      },
      auth: {
        user: { id: "user-creator" },
        member: { organizationId: "org-active" },
      },
      server: { admin: { team: { create } } },
    } as unknown as FastifyRequest;
    const { reply, send } = createReply();

    await createTeamMember(request as never, reply);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorUserId: "user-creator",
        organizationIds: ["org-active", "org-secondary"],
      }),
    );
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ id: "member-new" }));
  });
});
