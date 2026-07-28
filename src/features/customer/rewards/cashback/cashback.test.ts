import { describe, expect, it } from "vitest";
import { cashbackMovementSchema } from "./cashback.schemas";

describe("customer cashback movements", () => {
  it("acepta ajustes globales sin pedido ni sucursal", () => {
    expect(
      cashbackMovementSchema.parse({
        id: "adjustment-credit",
        type: "adjustment_credit",
        amountCents: 1_250,
        balanceAfterCents: 4_500,
        organizationId: null,
        createdAt: new Date("2026-07-28T18:00:00.000Z"),
        order: null,
      }),
    ).toEqual(
      expect.objectContaining({
        type: "adjustment_credit",
        organizationId: null,
        order: null,
      }),
    );
  });

  it("conserva el contrato de movimientos de pedido", () => {
    expect(
      cashbackMovementSchema.parse({
        id: "earned",
        type: "earned",
        amountCents: 500,
        balanceAfterCents: 1_500,
        organizationId: "org-one",
        createdAt: new Date("2026-07-28T18:00:00.000Z"),
        order: { id: "order-one", folio: "07-26-000001" },
      }),
    ).toEqual(expect.objectContaining({ type: "earned" }));
  });
});
