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
      }),
    ).toEqual({
      name: "Ana",
      surnames: "López",
      email: "ana@tukafe.test",
      password: "segura123",
      role: "admin",
    });

    expect(() =>
      createBodySchema.parse({
        name: "Ana",
        surnames: "López",
        email: "ana@tukafe.test",
        password: "corta",
        role: "owner",
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
    const inserted = new Map<unknown, Record<string, unknown>>();
    const transaction = vi.fn(async (callback: (tx: unknown) => unknown) => {
      const tx = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })),
          })),
        })),
        insert: vi.fn((table: unknown) => ({
          values: vi.fn((values: Record<string, unknown>) => {
            inserted.set(table, values);
            if (table === memberDB) {
              return {
                returning: vi.fn().mockResolvedValue([{ createdAt: new Date("2026-07-15") }]),
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
      organizationId: "org-active",
      name: "  Luis   Alberto ",
      surnames: " Pérez   Soto ",
      email: " LUIS@TUKAFE.TEST ",
      password: "segura123",
      role: "barista",
    });

    expect(transaction).toHaveBeenCalledOnce();
    expect(inserted.get(userDB)).toEqual(
      expect.objectContaining({
        name: "Luis Alberto",
        middleName: "Pérez Soto",
        email: "luis@tukafe.test",
        emailVerified: true,
      }),
    );
    expect(inserted.get(userDB)).not.toHaveProperty("role");
    expect(inserted.get(memberDB)).toEqual(
      expect.objectContaining({
        organizationId: "org-active",
        role: "barista",
      }),
    );

    const account = inserted.get(accountDB);
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
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([{ id: "user-existing" }]),
            })),
          })),
        })),
        insert,
      }),
    );
    const service = adminTeamService({ db: { transaction } } as unknown as FastifyInstance);
    const input: CreateTeamMemberParams = {
      organizationId: "org-active",
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

  it("crea mediante el controlador en la sucursal activa", async () => {
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
      },
      auth: { member: { organizationId: "org-active" } },
      server: { admin: { team: { create } } },
    } as unknown as FastifyRequest;
    const { reply, send } = createReply();

    await createTeamMember(request as never, reply);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-active" }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ id: "member-new" }));
  });
});
