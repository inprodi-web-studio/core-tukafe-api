import featureNamespacesPlugin from "@core/plugins/featureNamespaces.plugin";
import zodSchemaPlugin from "@core/plugins/zodSchema.plugin";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import adminCustomersServicesPlugin from "./customers.plugin";
import { adminCustomersRoutes } from "./customers.routes";
import { listQuerySchema } from "./customers.schemas";
import { adminCustomersService } from "./customers.service";
import type { AdminCustomersService } from "./customers.types";

const servers: Array<ReturnType<typeof Fastify>> = [];

function createQueryBuilder(result: unknown[]) {
  const builder = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    groupBy: vi.fn(),
    $dynamic: vi.fn(),
    as: vi.fn(),
    orderBy: vi.fn(),
    offset: vi.fn(),
    limit: vi.fn(),
    execute: vi.fn().mockResolvedValue(result),
  };

  for (const method of [
    "from",
    "leftJoin",
    "where",
    "groupBy",
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

async function createRouteServer({
  role,
  session = true,
}: {
  role: "owner" | "admin" | "barista";
  session?: boolean;
}) {
  const list = vi.fn<AdminCustomersService["list"]>().mockResolvedValue({
    data: [],
    pagination: { page: 1, pageSize: 30, totalItems: 0, totalPages: 0 },
  });
  const server = Fastify();
  servers.push(server);

  await server.register(zodSchemaPlugin);
  server.decorate("admin", { customers: { list } } as unknown as typeof server.admin);
  server.decorate("auth", {
    api: {
      getSession: vi.fn().mockResolvedValue(
        session
          ? {
              session: { activeOrganizationId: "org-active" },
              user: { id: "user-admin" },
            }
          : null,
      ),
    },
  } as unknown as typeof server.auth);
  server.decorate("db", {
    query: {
      memberDB: {
        findFirst: vi.fn().mockResolvedValue({
          id: "member-admin",
          userId: "user-admin",
          organizationId: "org-active",
          role,
        }),
      },
    },
  } as unknown as typeof server.db);
  await server.register(adminCustomersRoutes, { prefix: "/customers" });
  await server.ready();

  return { server, list };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("admin customers", () => {
  it("registra el servicio en el namespace de Fastify", async () => {
    const server = Fastify();
    servers.push(server);
    await server.register(featureNamespacesPlugin);
    await server.register(adminCustomersServicesPlugin);
    await server.ready();

    expect(server.admin.customers).toEqual({
      list: expect.any(Function),
    });
  });

  it("aplica defaults, limita la consulta y rechaza filtros de sucursal", () => {
    expect(listQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 30,
      sortBy: "lastOrderAt",
      sortDirection: "desc",
    });
    expect(listQuerySchema.parse({ search: "  ana perez  " }).search).toBe("ana perez");
    expect(() => listQuerySchema.parse({ pageSize: 101 })).toThrow();
    expect(() => listQuerySchema.parse({ search: "a".repeat(101) })).toThrow();
    expect(() => listQuerySchema.parse({ organizationId: "org-other" })).toThrow();
    expect(() => listQuerySchema.parse({ sortBy: "deletedAt" })).toThrow();
  });

  it("permite a propietarios y administradores listar sin pasar la sucursal al servicio", async () => {
    for (const role of ["owner", "admin"] as const) {
      const { server, list } = await createRouteServer({ role });
      const response = await server.inject({
        method: "GET",
        url: "/customers?page=2&pageSize=15&search=ana&sortBy=orderCount&sortDirection=asc",
      });

      expect(response.statusCode).toBe(200);
      expect(list).toHaveBeenCalledWith({
        page: 2,
        pageSize: 15,
        search: "ana",
        sortBy: "orderCount",
        sortDirection: "asc",
      });
    }
  });

  it("rechaza sesiones ausentes y roles fuera del portal administrativo", async () => {
    const withoutSession = await createRouteServer({ role: "owner", session: false });
    const barista = await createRouteServer({ role: "barista" });

    expect(
      (await withoutSession.server.inject({ method: "GET", url: "/customers" })).statusCode,
    ).toBe(401);
    expect((await barista.server.inject({ method: "GET", url: "/customers" })).statusCode).toBe(
      403,
    );
    expect(withoutSession.list).not.toHaveBeenCalled();
    expect(barista.list).not.toHaveBeenCalled();
  });

  it("mapea actividad global y conserva clientes sin compras", async () => {
    const activeCustomer = {
      id: "customer-active",
      name: "Ana",
      middleName: null,
      lastName: "Pérez",
      phone: "+523311111111",
      email: "ana@tukafe.test",
      cashbackBalanceCents: "12500",
      orderCount: "3",
      lastOrderAt: "2026-07-20T12:00:00.000Z",
      createdAt: new Date("2026-06-01T12:00:00.000Z"),
    };
    const customerWithoutOrders = {
      id: "customer-new",
      name: null,
      middleName: null,
      lastName: null,
      phone: "+523322222222",
      email: null,
      cashbackBalanceCents: "0",
      orderCount: "0",
      lastOrderAt: null,
      createdAt: new Date("2026-07-21T12:00:00.000Z"),
    };
    const countQuery = createQueryBuilder([]);
    const dataQuery = createQueryBuilder([activeCustomer, customerWithoutOrders]);
    const totalQuery = createQueryBuilder([{ totalItems: 2 }]);
    const select = vi
      .fn()
      .mockReturnValueOnce(countQuery)
      .mockReturnValueOnce(dataQuery)
      .mockReturnValueOnce(totalQuery);
    const service = adminCustomersService({
      db: { select },
    } as unknown as FastifyInstance);

    const result = await service.list({
      page: 1,
      pageSize: 30,
      search: "ana perez",
      sortBy: "lastOrderAt",
      sortDirection: "desc",
    });

    expect(result).toEqual({
      data: [
        {
          ...activeCustomer,
          cashbackBalanceCents: 12500,
          orderCount: 3,
          lastOrderAt: new Date("2026-07-20T12:00:00.000Z"),
        },
        { ...customerWithoutOrders, cashbackBalanceCents: 0, orderCount: 0 },
      ],
      pagination: { page: 1, pageSize: 30, totalItems: 2, totalPages: 1 },
    });
    expect(countQuery.leftJoin).toHaveBeenCalledTimes(2);
    expect(countQuery.where).toHaveBeenCalledOnce();
    expect(countQuery.groupBy).toHaveBeenCalledOnce();
    const dialect = new PgDialect();
    const filterSql = dialect.sqlToQuery(countQuery.where.mock.calls[0]![0] as SQL).sql;
    expect(filterSql).toContain('"customer"."deleted_at" is null');
    expect(filterSql).toContain("concat_ws");
    expect(filterSql).toContain('"customer"."phone" ilike');
    expect(filterSql).toContain('"customer"."email" ilike');
    expect(filterSql).not.toContain("organization");

    const primaryOrderSql = dialect.sqlToQuery(dataQuery.orderBy.mock.calls[0]![0] as SQL).sql;
    expect(primaryOrderSql).toContain("desc nulls last");
    expect(dataQuery.orderBy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });
});
