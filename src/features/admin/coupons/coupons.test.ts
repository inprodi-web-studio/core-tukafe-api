import featureNamespacesPlugin from "@core/plugins/featureNamespaces.plugin";
import { couponsDB } from "@core/db/schemas";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import {
  applyCouponToPreparedOrder,
  type CouponWithRules,
} from "../../shared/orders/orders.coupons";
import type { PreparedOrderPayload } from "../../shared/orders/orders.validators";
import { normalizeCouponRules, normalizeCreateCouponInput } from "./coupons.helpers";
import adminCouponsServicesPlugin from "./coupons.plugin";
import { listQuerySchema } from "./coupons.schemas";
import { create } from "./create/create.controllers";
import { createBodySchema } from "./create/create.schemas";
import { getById } from "./getById/getById.controllers";
import { list } from "./list/list.controllers";
import { update } from "./update/update.controllers";
import { updateStatus } from "./updateStatus/updateStatus.controllers";
import { adminCouponsService } from "./coupons.service";

const ACTIVE_ORGANIZATION_ID = "org_active_1234567890";
const SECOND_ORGANIZATION_ID = "org_second_1234567890";

function createReply() {
  const send = vi.fn();
  const reply = {
    status: vi.fn().mockReturnValue({ send }),
  } as unknown as FastifyReply;

  return { reply, send };
}

function couponInput(overrides: Record<string, unknown> = {}) {
  return {
    organizationIds: [ACTIVE_ORGANIZATION_ID],
    code: " VERANO 20 ",
    startsAt: "2026-07-17T12:00:00.000Z",
    discountType: "percentage" as const,
    discountValue: 2000,
    ...overrides,
  };
}

describe("admin coupons contract", () => {
  it("registra todas las operaciones del servicio en el namespace de Fastify", async () => {
    const server = Fastify();
    await server.register(featureNamespacesPlugin);
    await server.register(adminCouponsServicesPlugin);
    await server.ready();

    expect(server.admin.coupons).toEqual({
      list: expect.any(Function),
      create: expect.any(Function),
      getById: expect.any(Function),
      update: expect.any(Function),
      updateStatus: expect.any(Function),
      listRuleOptions: expect.any(Function),
    });

    await server.close();
  });

  it("aplica paginación segura y no acepta organizationId desde el cliente", () => {
    expect(listQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 30,
      sortBy: "updatedAt",
      sortDirection: "desc",
    });
    expect(() => listQuerySchema.parse({ pageSize: 101 })).toThrow();
    expect(() => listQuerySchema.parse({ organizationId: SECOND_ORGANIZATION_ID })).toThrow();
  });

  it("acepta creación multi-sucursal, elimina duplicados y permite límite por cliente nulo", () => {
    const parsed = createBodySchema.parse(
      couponInput({
        organizationIds: [ACTIVE_ORGANIZATION_ID, SECOND_ORGANIZATION_ID, ACTIVE_ORGANIZATION_ID],
        maxRedemptionsPerCustomer: null,
      }),
    );

    expect(parsed.organizationIds).toEqual([ACTIVE_ORGANIZATION_ID, SECOND_ORGANIZATION_ID]);
    expect(parsed.maxRedemptionsPerCustomer).toBeNull();
    expect(() => createBodySchema.parse(couponInput({ organizationIds: [] }))).toThrow();
    expect(() =>
      createBodySchema.parse(couponInput({ organizationId: ACTIVE_ORGANIZATION_ID })),
    ).toThrow();
  });

  it("normaliza código, defaults y reglas sin perder el modo ilimitado", () => {
    const normalized = normalizeCreateCouponInput({
      creatorUserId: "user-owner",
      ...couponInput({ maxRedemptionsPerCustomer: null }),
    });

    expect(normalized).toEqual(
      expect.objectContaining({
        code: "VERANO 20",
        normalizedCode: "VERANO20",
        isActive: true,
        maxRedemptionsPerCustomer: null,
      }),
    );
    expect(() =>
      normalizeCouponRules({
        includeProductIds: ["product-one"],
        excludeProductIds: ["product-one"],
      }),
    ).toThrowError(expect.objectContaining({ code: "coupon.rules.productOverlap" }));
  });

  it("toma el usuario y la sucursal exclusivamente de la sesión autenticada", async () => {
    const services = {
      list: vi.fn().mockResolvedValue({ data: [], pagination: {} }),
      create: vi.fn().mockResolvedValue({ data: [] }),
      getById: vi.fn().mockResolvedValue({ id: "coupon-one" }),
      update: vi.fn().mockResolvedValue({ id: "coupon-one" }),
      updateStatus: vi.fn().mockResolvedValue({ id: "coupon-one" }),
    };
    const auth = {
      user: { id: "user-owner" },
      member: { organizationId: ACTIVE_ORGANIZATION_ID },
    };

    await list(
      {
        query: { page: 1, pageSize: 30, sortBy: "updatedAt", sortDirection: "desc" },
        auth,
        server: { admin: { coupons: services } },
      } as unknown as FastifyRequest as never,
      createReply().reply,
    );
    await create(
      {
        body: couponInput({ organizationIds: [SECOND_ORGANIZATION_ID] }),
        auth,
        server: { admin: { coupons: services } },
      } as unknown as FastifyRequest as never,
      createReply().reply,
    );
    await getById(
      {
        params: { couponId: "coupon-one" },
        auth,
        server: { admin: { coupons: services } },
      } as unknown as FastifyRequest as never,
      createReply().reply,
    );
    await update(
      {
        params: { couponId: "coupon-one" },
        body: { code: "NUEVO" },
        auth,
        server: { admin: { coupons: services } },
      } as unknown as FastifyRequest as never,
      createReply().reply,
    );
    await updateStatus(
      {
        params: { couponId: "coupon-one" },
        body: { isActive: false },
        auth,
        server: { admin: { coupons: services } },
      } as unknown as FastifyRequest as never,
      createReply().reply,
    );

    expect(services.list).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ACTIVE_ORGANIZATION_ID }),
    );
    expect(services.create).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorUserId: "user-owner",
        organizationIds: [SECOND_ORGANIZATION_ID],
      }),
    );
    expect(services.getById).toHaveBeenCalledWith("coupon-one", ACTIVE_ORGANIZATION_ID);
    expect(services.update).toHaveBeenCalledWith(
      "coupon-one",
      expect.objectContaining({ organizationId: ACTIVE_ORGANIZATION_ID }),
    );
    expect(services.updateStatus).toHaveBeenCalledWith("coupon-one", ACTIVE_ORGANIZATION_ID, {
      isActive: false,
    });
  });

  it("crea las copias dentro de una sola transacción", async () => {
    let selected = 0;
    let insertedCoupons: Array<Record<string, unknown>> = [];
    const transaction = vi.fn(async (callback: (tx: unknown) => unknown) => {
      const tx = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn().mockImplementation(() => {
              selected += 1;
              return Promise.resolve(
                selected === 1
                  ? [
                      { organizationId: ACTIVE_ORGANIZATION_ID },
                      { organizationId: SECOND_ORGANIZATION_ID },
                    ]
                  : [],
              );
            }),
          })),
        })),
        insert: vi.fn((table: unknown) => ({
          values: vi.fn((values: Array<Record<string, unknown>>) => {
            if (table === couponsDB) insertedCoupons = values;
            return Promise.resolve();
          }),
        })),
        delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
      };

      return callback(tx);
    });
    const findFirst = vi.fn().mockImplementation(({ where: _where }) => {
      const inserted = insertedCoupons[findFirst.mock.calls.length - 1] ?? insertedCoupons[0];
      return Promise.resolve({
        ...inserted,
        id: inserted?.id ?? "coupon-created",
        createdAt: new Date("2026-07-17T12:00:00.000Z"),
        updatedAt: new Date("2026-07-17T12:00:00.000Z"),
        productRules: [],
        categoryRules: [],
      });
    });
    const service = adminCouponsService({
      db: {
        transaction,
        query: { couponsDB: { findFirst } },
      },
    } as unknown as FastifyInstance);

    const result = await service.create({
      creatorUserId: "user-owner",
      ...couponInput({ organizationIds: [ACTIVE_ORGANIZATION_ID, SECOND_ORGANIZATION_ID] }),
    });

    expect(transaction).toHaveBeenCalledOnce();
    expect(insertedCoupons).toHaveLength(2);
    expect(insertedCoupons.map((coupon) => coupon.organizationId)).toEqual([
      ACTIVE_ORGANIZATION_ID,
      SECOND_ORGANIZATION_ID,
    ]);
    expect(result.data).toHaveLength(2);
  });

  it("cancela la creación completa si el código existe en cualquier sucursal", async () => {
    let selected = 0;
    const insert = vi.fn();
    const transaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn().mockImplementation(() => {
              selected += 1;
              return Promise.resolve(
                selected === 1
                  ? [
                      { organizationId: ACTIVE_ORGANIZATION_ID },
                      { organizationId: SECOND_ORGANIZATION_ID },
                    ]
                  : [{ organizationId: SECOND_ORGANIZATION_ID }],
              );
            }),
          })),
        })),
        insert,
      }),
    );
    const service = adminCouponsService({ db: { transaction } } as unknown as FastifyInstance);

    await expect(
      service.create({
        creatorUserId: "user-owner",
        ...couponInput({ organizationIds: [ACTIVE_ORGANIZATION_ID, SECOND_ORGANIZATION_ID] }),
      }),
    ).rejects.toMatchObject({
      code: "coupon.duplicateCode",
      statusCode: 409,
      data: { organizationIds: [SECOND_ORGANIZATION_ID] },
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("aplica descendientes de categoría y da prioridad a las exclusiones", () => {
    const coupon = {
      id: "coupon-one",
      code: "CAT20",
      discountType: "percentage",
      discountValue: 2000,
      minEligibleSubtotalCents: null,
      maxDiscountCents: null,
      productRules: [],
      categoryRules: [{ categoryId: "category-parent", mode: "include" }],
      resolvedCategoryRules: [
        { categoryId: "category-parent", mode: "include" },
        { categoryId: "category-child", mode: "include" },
        { categoryId: "category-excluded", mode: "exclude" },
      ],
    } as unknown as CouponWithRules;
    const preparedPayload = {
      items: [
        {
          item: {
            id: "item-child",
            productId: "product-child",
            subtotalCents: 10_000,
            taxesCents: 1_600,
            grandTotalCents: 11_600,
          },
          productCategoryIds: ["category-child"],
        },
        {
          item: {
            id: "item-excluded",
            productId: "product-excluded",
            subtotalCents: 5_000,
            taxesCents: 800,
            grandTotalCents: 5_800,
          },
          productCategoryIds: ["category-child", "category-excluded"],
        },
      ],
      subtotalCents: 15_000,
      taxesCents: 2_400,
      grandTotalCents: 17_400,
    } as unknown as PreparedOrderPayload;

    const result = applyCouponToPreparedOrder({ preparedPayload, coupon });

    expect(result.coupon.eligibleSubtotalCents).toBe(10_000);
    expect(result.coupon.appliedItems).toEqual([
      expect.objectContaining({ orderItemId: "item-child", productId: "product-child" }),
    ]);
    expect(result.payload.items[1]?.item.couponDiscountCents).toBe(0);
  });
});
