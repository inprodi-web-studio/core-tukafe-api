import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { currentOrderLocalDate, resolveOrderDateRange } from "./orders.period";
import { adminOrdersListQuerySchema } from "./orders.read.schemas";
import { requireGlobalOrderOwner } from "./orders.routes";
import { deriveOrderPaymentStatus, deriveOrderPreparationStatus } from "./orders.service";

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

describe("administrative order reads", () => {
  it("allows only the global owner role", async () => {
    await expect(requireGlobalOrderOwner(requestWithRole("owner"))).resolves.toBeUndefined();
    await expect(requireGlobalOrderOwner(requestWithRole("admin"))).rejects.toMatchObject({
      code: "order.globalOwnerRequired",
      statusCode: 403,
    });
    await expect(requireGlobalOrderOwner(requestWithRole("barista"))).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("defaults the query and validates filters", () => {
    expect(adminOrdersListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 30,
      paymentStatus: "all",
      preparationStatus: "all",
      source: "all",
    });
    expect(() => adminOrdersListQuerySchema.parse({ paymentStatus: "pending" })).toThrow();
    expect(() => adminOrdersListQuerySchema.parse({ pageSize: 101 })).toThrow();
  });

  it("uses Mexico City calendar days as a semi-open UTC range", () => {
    const now = new Date("2026-08-12T04:30:00.000Z");
    expect(currentOrderLocalDate(now)).toBe("2026-08-11");
    expect(resolveOrderDateRange({ dateFrom: "2026-04-05", dateTo: "2026-04-05" })).toEqual({
      dateFrom: "2026-04-05",
      dateTo: "2026-04-05",
      startAt: new Date("2026-04-05T06:00:00.000Z"),
      endAt: new Date("2026-04-06T06:00:00.000Z"),
    });
    expect(() =>
      resolveOrderDateRange({ dateFrom: "2026-04-06", dateTo: "2026-04-05" }),
    ).toThrowError(expect.objectContaining({ code: "order.dateRangeInvalid" }));
  });

  it("derives payment state without treating cashback as a discount", () => {
    expect(deriveOrderPaymentStatus({ amountDueCents: 500, hasCompletedPayment: true })).toBe(
      "paid",
    );
    expect(deriveOrderPaymentStatus({ amountDueCents: 0, hasCompletedPayment: false })).toBe(
      "not_required",
    );
    expect(deriveOrderPaymentStatus({ amountDueCents: 500, hasCompletedPayment: false })).toBe(
      "not_recorded",
    );
  });

  it("derives preparation state in the required precedence", () => {
    const now = new Date("2026-08-12T12:00:00.000Z");
    expect(deriveOrderPreparationStatus({ total: 0, open: 0, scheduledFor: null, now })).toBe(
      "no_work",
    );
    expect(deriveOrderPreparationStatus({ total: 2, open: 0, scheduledFor: null, now })).toBe(
      "ready",
    );
    expect(
      deriveOrderPreparationStatus({
        total: 2,
        open: 1,
        scheduledFor: new Date("2026-08-12T13:00:00.000Z"),
        now,
      }),
    ).toBe("scheduled");
    expect(deriveOrderPreparationStatus({ total: 2, open: 1, scheduledFor: now, now })).toBe(
      "preparing",
    );
  });
});
