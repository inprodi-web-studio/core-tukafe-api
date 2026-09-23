import { describe, expect, it } from "vitest";
import { dateInTimezone } from "./purchaseOrders.dates";

describe("purchase order dates", () => {
  it("formats a raw PostgreSQL issue timestamp in the inventory location timezone", () => {
    const issuedAt = "2026-09-24 02:30:00.000+00";

    expect(dateInTimezone(issuedAt, "America/Mexico_City")).toBe("2026-09-23");
    expect(dateInTimezone(new Date(issuedAt), "America/Mexico_City")).toBe("2026-09-23");
  });
});
