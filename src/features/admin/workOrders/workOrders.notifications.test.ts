import { describe, expect, it } from "vitest";
import { shouldEnqueueOrderReadyNotification } from "./workOrders.service";

describe("order-ready notification eligibility", () => {
  it("notifica únicamente el último trabajo de un pedido móvil identificado", () => {
    expect(
      shouldEnqueueOrderReadyNotification({
        source: "mobile",
        customerId: "customer-1",
        hasRemainingWorkOrders: false,
      }),
    ).toBe(true);
  });

  it.each(["guest", "inplace", "admin", "unknown"])(
    "no notifica pedidos con origen %s",
    (source) => {
      expect(
        shouldEnqueueOrderReadyNotification({
          source,
          customerId: "customer-1",
          hasRemainingWorkOrders: false,
        }),
      ).toBe(false);
    },
  );

  it("no notifica mientras existan trabajos abiertos", () => {
    expect(
      shouldEnqueueOrderReadyNotification({
        source: "mobile",
        customerId: "customer-1",
        hasRemainingWorkOrders: true,
      }),
    ).toBe(false);
  });

  it("no notifica pedidos sin cliente", () => {
    expect(
      shouldEnqueueOrderReadyNotification({
        source: "mobile",
        customerId: null,
        hasRemainingWorkOrders: false,
      }),
    ).toBe(false);
  });
});
