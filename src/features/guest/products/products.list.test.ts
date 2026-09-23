import { PgDialect } from "drizzle-orm/pg-core";
import { sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { guestProductsService } from "./products.service";

describe("guest products list", () => {
  it("orders featured products first, then by name and ID", async () => {
    const findMany = vi.fn(async (_options: { orderBy: SQL[] }) => []);
    const fastify = {
      db: { query: { productsDB: { findMany } } },
    } as unknown as FastifyInstance;

    await expect(guestProductsService(fastify).list()).resolves.toEqual([]);

    const orderBy = findMany.mock.calls[0]![0].orderBy;
    const orderSql = new PgDialect().sqlToQuery(sql.join(orderBy, sql`, `)).sql;
    expect(orderSql).toBe('"product"."is_featured" desc, "product"."name" asc, "product"."id" asc');
  });
});
