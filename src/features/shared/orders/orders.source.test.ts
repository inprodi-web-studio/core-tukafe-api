import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    PUBLIC_URL: "http://localhost:5175",
    API_URL: "http://localhost:8081",
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters",
    TWILIO_ACCOUNT_SID: `AC${"0".repeat(32)}`,
    TWILIO_AUTH_TOKEN: "test-token",
    TWILIO_FROM_PHONE_NUMBER: "+5210000000000",
  });
});

const sharedOrderMocks = vi.hoisted(() => ({
  createOrder: vi.fn().mockResolvedValue({}),
  createOrderPaymentAttempt: vi.fn(),
  loadOrder: vi.fn(),
  loadPaymentAttempt: vi.fn(),
  previewOrder: vi.fn(),
  recordOrderPaymentAttemptResult: vi.fn(),
}));

vi.mock("@features/shared/orders/orders.service", () => sharedOrderMocks);

import { createBodySchema as adminCreateBodySchema } from "@features/admin/orders/create/create.schemas";
import { adminOrdersService } from "@features/admin/orders/orders.service";
import { createBodySchema as customerCreateBodySchema } from "@features/customer/orders/create/create.schemas";
import { customerOrdersService } from "@features/customer/orders/orders.service";
import { createBodySchema as guestCreateBodySchema } from "@features/guest/orders/create/create.schemas";
import { guestOrdersService } from "@features/guest/orders/orders.service";

const orderInput = {
  organizationId: "org-one",
  customerId: "customer-one",
  items: [],
};

describe("order source", () => {
  beforeEach(() => {
    sharedOrderMocks.createOrder.mockClear();
  });

  it("asigna el origen internamente según el contexto que crea la orden", async () => {
    const fastify = {} as FastifyInstance;

    await guestOrdersService(fastify).create(orderInput);
    expect(sharedOrderMocks.createOrder).toHaveBeenLastCalledWith(
      fastify,
      expect.objectContaining({ organizationId: "org-one" }),
      expect.objectContaining({ source: "inplace" }),
    );

    await customerOrdersService(fastify).create(orderInput);
    expect(sharedOrderMocks.createOrder).toHaveBeenLastCalledWith(
      fastify,
      orderInput,
      expect.objectContaining({ source: "mobile" }),
    );

    await adminOrdersService(fastify).create(orderInput);
    expect(sharedOrderMocks.createOrder).toHaveBeenLastCalledWith(
      fastify,
      orderInput,
      expect.objectContaining({ source: "admin" }),
    );
  });

  it.each([
    [
      "guest",
      guestCreateBodySchema,
      { organizationId: "org-one", items: [{ productId: "123456789012345678901", quantity: 1 }] },
    ],
    [
      "customer",
      customerCreateBodySchema,
      { organizationId: "org-one", items: [{ productId: "123456789012345678901", quantity: 1 }] },
    ],
    [
      "admin",
      adminCreateBodySchema,
      { customerId: "customer-one", items: [{ productId: "123456789012345678901", quantity: 1 }] },
    ],
  ])("rechaza source en el payload %s", (_context, schema, body) => {
    expect(() => schema.parse({ ...body, source: "mobile" })).toThrow();
  });
});
