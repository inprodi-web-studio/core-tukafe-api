import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import zodSchemaPlugin from "@core/plugins/zodSchema.plugin";
import { getDashboard } from "./dashboard.controllers";
import { buildDashboardPeriodRange, listDashboardBuckets } from "./dashboard.period";
import { dashboardQuerySchema } from "./dashboard.schemas";
import { adminDashboardService } from "./dashboard.service";
import { adminDashboardRoutes } from "./dashboard.routes";

function createReply() {
  const send = vi.fn();
  const reply = {
    status: vi.fn().mockReturnValue({ send }),
  } as unknown as FastifyReply;
  return { reply, send };
}

function createDashboardFastify({ memberships }: { memberships: Array<{ organizationId: string }> }) {
  const orderBy = vi.fn().mockResolvedValue(memberships);
  const where = vi.fn().mockReturnValue({ orderBy });
  const innerJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ innerJoin });
  const select = vi.fn().mockReturnValue({ from });
  const execute = vi
    .fn()
    .mockResolvedValueOnce({
      rows: [
        {
          bucket: "2026-07-01",
          orders: 2,
          generatedSalesCents: 10_000,
          netCollectedCents: 8_000,
          tipsCents: 1_000,
          freeDrinkRedemptions: 1,
          freeDrinkUnits: 2,
          cashbackRedemptions: 1,
          cashbackRedeemedCents: 2_000,
        },
      ],
    })
    .mockResolvedValueOnce({
      rows: [
        {
          orders: 1,
          generatedSalesCents: 5_000,
          netCollectedCents: 5_000,
          tipsCents: 500,
          freeDrinkRedemptions: 0,
          freeDrinkUnits: 0,
          cashbackRedemptions: 0,
          cashbackRedeemedCents: 0,
        },
      ],
    })
    .mockResolvedValueOnce({
      rows: [
        {
          productId: "product-1",
          name: "Latte",
          deliveredUnits: 8,
          paidUnits: 6,
          freeUnits: 2,
          generatedSalesCents: 7_000,
        },
      ],
    });

  return {
    fastify: { db: { select, execute } } as unknown as FastifyInstance,
    execute,
  };
}

describe("admin dashboard", () => {
  it("valida el contrato de consulta y rechaza campos adicionales", () => {
    expect(
      dashboardQuerySchema.parse({ anchorDate: "2026-07-16" }),
    ).toEqual({ period: "month", anchorDate: "2026-07-16" });
    expect(() =>
      dashboardQuerySchema.parse({
        anchorDate: "2026-07-16",
        organizationIds: ["org-client"],
      }),
    ).toThrow();
    expect(() => dashboardQuerySchema.parse({ anchorDate: "16/07/2026" })).toThrow();
  });

  it("construye semanas de lunes a domingo y rellena buckets hasta hoy", () => {
    const range = buildDashboardPeriodRange({
      period: "week",
      anchorDate: "2026-07-16",
      now: new Date("2026-07-16T18:00:00.000Z"),
    });

    expect(range.start.format("YYYY-MM-DD")).toBe("2026-07-13");
    expect(range.end.format("YYYY-MM-DD")).toBe("2026-07-20");
    expect(range.comparisonStart.format("YYYY-MM-DD")).toBe("2026-07-06");
    expect(range.comparisonEnd.format("YYYY-MM-DD HH:mm")).toBe("2026-07-09 12:00");
    expect(listDashboardBuckets(range)).toEqual([
      "2026-07-13",
      "2026-07-14",
      "2026-07-15",
      "2026-07-16",
    ]);
  });

  it("calcula métricas, comparación, ceros y ranking para el alcance permitido", async () => {
    const { fastify, execute } = createDashboardFastify({
      memberships: [{ organizationId: "org-one" }, { organizationId: "org-two" }],
    });
    const service = adminDashboardService(fastify);

    const result = await service.get({
      userId: "user-admin",
      period: "month",
      anchorDate: "2026-07-16",
      now: new Date("2026-07-16T18:00:00.000Z"),
    });

    expect(execute).toHaveBeenCalledTimes(3);
    expect(result.scope).toEqual(
      expect.objectContaining({
        organizationId: null,
        organizationCount: 2,
        granularity: "day",
      }),
    );
    expect(result.timeline).toHaveLength(16);
    expect(result.timeline[0]).toEqual(
      expect.objectContaining({ bucket: "2026-07-01", orders: 2, freeDrinkUnits: 2 }),
    );
    expect(result.timeline[1]).toEqual(expect.objectContaining({ bucket: "2026-07-02", orders: 0 }));
    expect(result.summary.orders).toEqual({ value: 2, previousValue: 1, changePercent: 100 });
    expect(result.summary.generatedSalesCents).toEqual({
      value: 10_000,
      previousValue: 5_000,
      changePercent: 100,
    });
    expect(result.summary.netCollectedCents.value).toBe(8_000);
    expect(result.summary.tipsCents.value).toBe(1_000);
    expect(result.topProducts[0]).toEqual(
      expect.objectContaining({ deliveredUnits: 8, paidUnits: 6, freeUnits: 2 }),
    );
  });

  it("rechaza una sucursal fuera de las membresías administrativas", async () => {
    const { fastify, execute } = createDashboardFastify({
      memberships: [{ organizationId: "org-one" }],
    });

    await expect(
      adminDashboardService(fastify).get({
        userId: "user-admin",
        period: "month",
        anchorDate: "2026-07-16",
        organizationId: "org-forbidden",
        now: new Date("2026-07-16T18:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "dashboard.organizationAccessDenied", statusCode: 403 });
    expect(execute).not.toHaveBeenCalled();
  });

  it("pasa exclusivamente el usuario autenticado al servicio", async () => {
    const get = vi.fn().mockResolvedValue({ scope: {}, summary: {}, timeline: [], topProducts: [] });
    const request = {
      query: { period: "month", anchorDate: "2026-07-16" },
      auth: { user: { id: "user-authenticated" } },
      server: { admin: { dashboard: { get } } },
    } as unknown as FastifyRequest;
    const { reply, send } = createReply();

    await getDashboard(request as never, reply);

    expect(get).toHaveBeenCalledWith({
      period: "month",
      anchorDate: "2026-07-16",
      userId: "user-authenticated",
    });
    expect(send).toHaveBeenCalledOnce();
  });
});

describe("admin dashboard authorization", () => {
  async function createRouteServer(role: string | null, hasSession = true) {
    const server = Fastify();
    const get = vi.fn().mockResolvedValue({
      scope: {
        period: "month",
        granularity: "day",
        timezone: "America/Mexico_City",
        startAt: "2026-07-01T06:00:00.000Z",
        endAt: "2026-07-16T18:00:00.000Z",
        comparisonStartAt: "2026-06-01T06:00:00.000Z",
        comparisonEndAt: "2026-06-16T18:00:00.000Z",
        organizationId: null,
        organizationCount: 1,
      },
      summary: {
        orders: { value: 0, previousValue: 0, changePercent: null },
        generatedSalesCents: { value: 0, previousValue: 0, changePercent: null },
        netCollectedCents: { value: 0, previousValue: 0, changePercent: null },
        tipsCents: { value: 0, previousValue: 0, changePercent: null },
      },
      timeline: [],
      topProducts: [],
    });
    await server.register(zodSchemaPlugin);
    server.decorate("auth", {
      api: {
        getSession: vi.fn().mockResolvedValue(
          hasSession
            ? {
                user: { id: "user-1", name: "Admin", email: "admin@tukafe.test" },
                session: { id: "session-1", activeOrganizationId: "org-1" },
              }
            : null,
        ),
        hasPermission: vi.fn().mockResolvedValue({ success: true }),
      },
    } as never);
    server.decorate("db", {
      query: {
        memberDB: {
          findFirst: vi.fn().mockResolvedValue(
            role
              ? {
                  id: `member-${role}`,
                  userId: "user-1",
                  organizationId: "org-1",
                  role,
                }
              : null,
          ),
        },
      },
    } as never);
    server.decorate("admin", { dashboard: { get } } as never);
    await server.register(adminDashboardRoutes, { prefix: "/dashboard" });
    await server.ready();
    return { server, get };
  }

  it.each(["owner", "admin"])("permite al rol %s consultar el dashboard", async (role) => {
    const { server, get } = await createRouteServer(role);
    const response = await server.inject({
      method: "GET",
      url: "/dashboard?period=month&anchorDate=2026-07-16",
    });
    await server.close();

    expect(response.statusCode).toBe(200);
    expect(get).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", period: "month" }),
    );
  });

  it.each(["member", "barista"])("rechaza al rol %s", async (role) => {
    const { server, get } = await createRouteServer(role);
    const response = await server.inject({
      method: "GET",
      url: "/dashboard?period=month&anchorDate=2026-07-16",
    });
    await server.close();

    expect(response.statusCode).toBe(403);
    expect(get).not.toHaveBeenCalled();
  });

  it("rechaza solicitudes sin sesión", async () => {
    const { server, get } = await createRouteServer(null, false);
    const response = await server.inject({
      method: "GET",
      url: "/dashboard?period=month&anchorDate=2026-07-16",
    });
    await server.close();

    expect(response.statusCode).toBe(401);
    expect(get).not.toHaveBeenCalled();
  });
});
