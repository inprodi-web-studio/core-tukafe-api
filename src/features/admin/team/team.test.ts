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
        existingUser: false,
        credentialCreated: true,
      }),
    );
  });

  it("rechaza case-insensitive un correo que ya tiene acceso administrativo", async () => {
    const insert = vi.fn();
    let selectCall = 0;
    const transaction = vi.fn(async (callback: (tx: unknown) => unknown) => {
      const select = vi.fn(() => {
        selectCall += 1;
        const result =
          selectCall === 1
            ? [{ organizationId: "org-active" }]
            : selectCall === 2
              ? [
                  {
                    id: "user-existing",
                    name: "Ana",
                    middleName: "López",
                    lastName: null,
                    email: "Ana@Tukafe.test",
                  },
                ]
              : [{ id: "member-admin" }];

        return {
          from: vi.fn(() => ({
            where: vi.fn(() =>
              selectCall === 1
                ? Promise.resolve(result)
                : { limit: vi.fn().mockResolvedValue(result) },
            ),
          })),
        };
      });

      return callback({ select, insert });
    });
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

  it("reutiliza un cliente existente conservando su contraseña y sus datos", async () => {
    const insertedTables: unknown[] = [];
    let selectCall = 0;
    const transaction = vi.fn(async (callback: (tx: unknown) => unknown) => {
      const selectResults = [
        [{ organizationId: "org-active" }],
        [
          {
            id: "user-customer",
            name: "Cliente",
            middleName: "Existente",
            lastName: "Tukafe",
            email: "cliente@tukafe.test",
          },
        ],
        [],
        [{ id: "credential-existing" }],
      ];
      const select = vi.fn(() => {
        const currentCall = selectCall;
        const result = selectResults[selectCall++] ?? [];
        return {
          from: vi.fn(() => ({
            where: vi.fn(() =>
              currentCall === 0
                ? Promise.resolve(result)
                : { limit: vi.fn().mockResolvedValue(result) },
            ),
          })),
        };
      });
      const insert = vi.fn((table: unknown) => {
        insertedTables.push(table);
        return {
          values: vi.fn(() => ({
            returning: vi
              .fn()
              .mockResolvedValue([{ id: "member-new", createdAt: new Date("2026-07-15") }]),
          })),
        };
      });

      return callback({ select, insert });
    });
    const service = adminTeamService({ db: { transaction } } as unknown as FastifyInstance);

    const result = await service.create({
      creatorUserId: "user-creator",
      organizationIds: ["org-active"],
      name: "Nombre capturado",
      surnames: "Apellidos capturados",
      email: "CLIENTE@TUKAFE.TEST",
      password: "nueva-clave-que-no-debe-usarse",
      role: "admin",
    });

    expect(insertedTables).toEqual([memberDB]);
    expect(result).toEqual(
      expect.objectContaining({
        name: "Cliente",
        surnames: "Existente Tukafe",
        email: "cliente@tukafe.test",
        role: "admin",
        existingUser: true,
        credentialCreated: false,
      }),
    );
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
      existingUser: false,
      credentialCreated: true,
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
