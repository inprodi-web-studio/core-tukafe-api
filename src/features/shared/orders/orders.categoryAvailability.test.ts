import { organizationProductDB } from "@core/db/schemas";
import type { FastifyInstance } from "fastify";
import { and, eq, inArray, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { buildOrderValidationContext } from "./orders.validators";
import type { NormalizedCreateOrderItemParams } from "./orders.types";

describe("order category availability", () => {
  it("validates parent products and selected components with the same category predicate", async () => {
    let condition: SQL | undefined;
    const fastify = {
      db: {
        execute: vi.fn().mockResolvedValue({ rows: [{ exists: false }] }),
        query: {
          organizationProductDB: {
            findMany: vi.fn(
              async (options: {
                where: (
                  table: typeof organizationProductDB,
                  operators: { and: typeof and; eq: typeof eq; inArray: typeof inArray },
                ) => SQL;
              }) => {
                condition = options.where(organizationProductDB, { and, eq, inArray });
                return [];
              },
            ),
          },
        },
      },
    } as unknown as FastifyInstance;
    const item = {
      productId: "combo",
      components: [{ productId: "coffee", variationId: null }],
      variationId: null,
    } as NormalizedCreateOrderItemParams;
    await expect(buildOrderValidationContext(fastify, "branch-a", [item])).rejects.toMatchObject({
      code: "product.notAvailableInOrganization",
    });
    const query = new PgDialect().sqlToQuery(condition!);
    expect(query.sql).toContain("disabled_categories");
    expect(query.params).toContain("combo");
    expect(query.params).toContain("coffee");
    expect(query.params).toContain("branch-a");
  });
});
