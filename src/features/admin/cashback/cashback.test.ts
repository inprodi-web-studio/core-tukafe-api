import { customerCashbackAccountsDB, customerCashbackLedgerDB } from "@core/db/schemas";
import featureNamespacesPlugin from "@core/plugins/featureNamespaces.plugin";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { createCashbackAdjustment, listCashbackMovements } from "./cashback.controllers";
import adminCashbackServicesPlugin from "./cashback.plugin";
import { createAdjustmentBodySchema, listQuerySchema } from "./cashback.schemas";
import { adminCashbackService } from "./cashback.service";

function createReply() {
  const send = vi.fn();
  const reply = {
    status: vi.fn().mockReturnValue({ send }),
  } as unknown as FastifyReply;

  return { reply, send };
}

function createQueryBuilder(result: unknown[]) {
  const builder = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    $dynamic: vi.fn(),
    as: vi.fn(),
    orderBy: vi.fn(),
    offset: vi.fn(),
    limit: vi.fn(),
    execute: vi.fn().mockResolvedValue(result),
  };

  for (const method of [
    "from",
    "innerJoin",
    "leftJoin",
    "where",
    "$dynamic",
    "as",
    "orderBy",
    "offset",
    "limit",
  ] as const) {
    builder[method].mockReturnValue(builder);
  }

  return builder;
}

function createAdjustmentFastify({
  balanceCents,
  customerExists = true,
}: {
  balanceCents: number;
  customerExists?: boolean;
}) {
  let ledgerValues: Record<string, unknown> | undefined;
  let accountUpdate: Record<string, unknown> | undefined;
  const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn((table: unknown) => ({
    values: vi.fn((values: Record<string, unknown>) => {
      if (table === customerCashbackAccountsDB) {
        return { onConflictDoNothing };
      }

      if (table === customerCashbackLedgerDB) {
        ledgerValues = values;
        return {
          returning: vi.fn().mockResolvedValue([
            {
              id: "movement-adjustment",
              createdAt: new Date("2026-07-28T12:00:00.000Z"),
            },
          ]),
        };
      }

      throw new Error("Unexpected insert table");
    }),
  }));
  const whereUpdate = vi.fn().mockResolvedValue(undefined);
  const update = vi.fn(() => ({
    set: vi.fn((values: Record<string, unknown>) => {
      accountUpdate = values;
      return { where: whereUpdate };
    }),
  }));
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(customerExists ? [{ id: "customer-one" }] : []),
      })),
    })),
  }));
  const execute = vi.fn().mockResolvedValue({
    rows: [{ balanceCents }],
  });
  const tx = {
    select,
    insert,
    execute,
    update,
  };
  const transaction = vi.fn(async (callback: (input: typeof tx) => unknown) => callback(tx));

  return {
    fastify: { db: { transaction } } as unknown as FastifyInstance,
    execute,
    insert,
    update,
    getLedgerValues: () => ledgerValues,
    getAccountUpdate: () => accountUpdate,
  };
}

describe("admin cashback", () => {
  it("registra el servicio en el namespace administrativo", async () => {
    const server = Fastify();
    await server.register(featureNamespacesPlugin);
    await server.register(adminCashbackServicesPlugin);
    await server.ready();

    expect(server.admin.cashback).toEqual({
      list: expect.any(Function),
      createAdjustment: expect.any(Function),
    });

    await server.close();
  });

  it("valida defaults, filtros y ajustes monetarios estrictos", () => {
    expect(listQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 30,
      sortBy: "createdAt",
      sortDirection: "desc",
    });
    expect(
      listQuerySchema.parse({
        direction: "credit",
        source: "adjustment",
        search: "  ana  ",
      }),
    ).toEqual({
      page: 1,
      pageSize: 30,
      direction: "credit",
      source: "adjustment",
      search: "ana",
      sortBy: "createdAt",
      sortDirection: "desc",
    });
    expect(
      createAdjustmentBodySchema.parse({
        customerId: " customer-one ",
        direction: "debit",
        amountCents: 1250,
        reason: " Corrección de saldo ",
      }),
    ).toEqual({
      customerId: "customer-one",
      direction: "debit",
      amountCents: 1250,
      reason: "Corrección de saldo",
    });
    expect(() => createAdjustmentBodySchema.parse({})).toThrow();
    expect(() =>
      createAdjustmentBodySchema.parse({
        customerId: "customer-one",
        direction: "credit",
        amountCents: 0,
        reason: "Motivo",
      }),
    ).toThrow();
    expect(() => listQuerySchema.parse({ organizationId: "org-active" })).toThrow();
  });

  it("lista movimientos globales de pedido y ajustes con búsqueda y filtros", async () => {
    const createdAt = new Date("2026-07-28T12:00:00.000Z");
    const countQuery = createQueryBuilder([]);
    const dataQuery = createQueryBuilder([
      {
        id: "movement-order",
        type: "earned",
        direction: "credit",
        source: "order",
        amountCents: 500,
        balanceAfterCents: 1500,
        createdAt,
        customerId: "customer-one",
        customerName: "Ana",
        customerMiddleName: null,
        customerLastName: "Pérez",
        customerPhone: "+523311111111",
        customerEmail: "ana@tukafe.test",
        organizationId: "org-one",
        organizationName: "Landmark",
        orderId: "order-one",
        orderFolio: "07-26-000001",
        reason: null,
        createdById: null,
        createdByName: null,
        createdByMiddleName: null,
        createdByLastName: null,
        createdByEmail: null,
      },
      {
        id: "movement-adjustment",
        type: "adjustment_debit",
        direction: "debit",
        source: "adjustment",
        amountCents: 200,
        balanceAfterCents: 1300,
        createdAt,
        customerId: "customer-one",
        customerName: "Ana",
        customerMiddleName: null,
        customerLastName: "Pérez",
        customerPhone: "+523311111111",
        customerEmail: "ana@tukafe.test",
        organizationId: null,
        organizationName: null,
        orderId: null,
        orderFolio: null,
        reason: "Corrección",
        createdById: "user-admin",
        createdByName: "Mario",
        createdByMiddleName: null,
        createdByLastName: "Admin",
        createdByEmail: "mario@tukafe.test",
      },
    ]);
    const totalQuery = createQueryBuilder([{ totalItems: 2 }]);
    const select = vi
      .fn()
      .mockReturnValueOnce(countQuery)
      .mockReturnValueOnce(dataQuery)
      .mockReturnValueOnce(totalQuery);
    const service = adminCashbackService({
      db: { select },
    } as unknown as FastifyInstance);

    const result = await service.list({
      page: 1,
      pageSize: 30,
      search: "ana",
      direction: "debit",
      source: "adjustment",
      sortBy: "createdAt",
      sortDirection: "desc",
    });

    expect(result.data[0]).toEqual(
      expect.objectContaining({
        source: "order",
        order: { id: "order-one", folio: "07-26-000001" },
        organization: { id: "org-one", name: "Landmark" },
        adjustment: null,
      }),
    );
    expect(result.data[1]).toEqual(
      expect.objectContaining({
        source: "adjustment",
        order: null,
        organization: null,
        adjustment: {
          reason: "Corrección",
          createdBy: {
            id: "user-admin",
            name: "Mario",
            middleName: null,
            lastName: "Admin",
            email: "mario@tukafe.test",
          },
        },
      }),
    );
    const dialect = new PgDialect();
    const filterSql = dialect.sqlToQuery(countQuery.where.mock.calls[0]![0] as SQL).sql;
    expect(filterSql).toContain('"customer"."email" ilike');
    expect(filterSql).toContain("adjustment_credit");
    expect(filterSql).not.toContain("organization_id =");
  });

  it("crea créditos y débitos bajo bloqueo sin alterar acumulados históricos", async () => {
    for (const testCase of [
      { direction: "credit" as const, initial: 1000, amount: 500, expected: 1500 },
      { direction: "debit" as const, initial: 1000, amount: 400, expected: 600 },
    ]) {
      const setup = createAdjustmentFastify({ balanceCents: testCase.initial });
      const service = adminCashbackService(setup.fastify);

      const result = await service.createAdjustment({
        customerId: "customer-one",
        direction: testCase.direction,
        amountCents: testCase.amount,
        reason: "  Corrección   autorizada ",
        createdByUserId: "user-admin",
      });

      expect(result).toEqual(
        expect.objectContaining({
          direction: testCase.direction,
          balanceBeforeCents: testCase.initial,
          balanceAfterCents: testCase.expected,
        }),
      );
      expect(setup.getAccountUpdate()).toEqual(
        expect.objectContaining({
          balanceCents: testCase.expected,
        }),
      );
      expect(setup.getAccountUpdate()).not.toHaveProperty("totalEarnedCents");
      expect(setup.getAccountUpdate()).not.toHaveProperty("totalRedeemedCents");
      expect(setup.getLedgerValues()).toEqual(
        expect.objectContaining({
          orderId: null,
          organizationId: null,
          createdByUserId: "user-admin",
          reason: "Corrección autorizada",
          movementType: testCase.direction === "credit" ? "adjustment_credit" : "adjustment_debit",
          amountCents: testCase.amount,
          balanceAfterCents: testCase.expected,
        }),
      );

      const dialect = new PgDialect();
      const lockSql = dialect.sqlToQuery(setup.execute.mock.calls[0]![0] as SQL).sql;
      expect(lockSql).toContain("for update");
    }
  });

  it("rechaza clientes inactivos y débitos superiores al saldo", async () => {
    const missingSetup = createAdjustmentFastify({
      balanceCents: 0,
      customerExists: false,
    });
    await expect(
      adminCashbackService(missingSetup.fastify).createAdjustment({
        customerId: "customer-missing",
        direction: "credit",
        amountCents: 100,
        reason: "Motivo",
        createdByUserId: "user-admin",
      }),
    ).rejects.toMatchObject({ code: "cashback.customerNotFound" });

    const insufficientSetup = createAdjustmentFastify({ balanceCents: 500 });
    await expect(
      adminCashbackService(insufficientSetup.fastify).createAdjustment({
        customerId: "customer-one",
        direction: "debit",
        amountCents: 501,
        reason: "Motivo",
        createdByUserId: "user-admin",
      }),
    ).rejects.toMatchObject({ code: "cashback.insufficientBalance" });
    expect(insufficientSetup.update).not.toHaveBeenCalled();
    expect(
      insufficientSetup.insert.mock.calls.filter(([table]) => table === customerCashbackLedgerDB),
    ).toHaveLength(0);
  });

  it("los controladores no aceptan sucursal y toman al administrador de la sesión", async () => {
    const list = vi.fn().mockResolvedValue({ data: [], pagination: {} });
    const createAdjustment = vi.fn().mockResolvedValue({ id: "movement-one" });
    const auth = {
      user: { id: "user-session" },
      member: { organizationId: "org-active" },
    };

    await listCashbackMovements(
      {
        query: listQuerySchema.parse({ search: "ana" }),
        auth,
        server: { admin: { cashback: { list, createAdjustment } } },
      } as unknown as FastifyRequest as never,
      createReply().reply,
    );
    await createCashbackAdjustment(
      {
        body: {
          customerId: "customer-one",
          direction: "credit",
          amountCents: 100,
          reason: "Motivo",
        },
        auth,
        server: { admin: { cashback: { list, createAdjustment } } },
      } as unknown as FastifyRequest as never,
      createReply().reply,
    );

    expect(list).toHaveBeenCalledWith(expect.objectContaining({ search: "ana" }));
    expect(list).not.toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-active" }),
    );
    expect(createAdjustment).toHaveBeenCalledWith({
      customerId: "customer-one",
      direction: "credit",
      amountCents: 100,
      reason: "Motivo",
      createdByUserId: "user-session",
    });
  });
});
