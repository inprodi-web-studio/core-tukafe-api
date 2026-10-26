import { DatabaseSync } from "node:sqlite";
import { productsDB } from "@core/db/schemas";
import * as schema from "@core/db/schemas";
import { drizzle } from "drizzle-orm/node-postgres";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { hasAvailableCompoundConfiguration } from "@features/guest/products/products.availability";
import {
  productCategoryAvailable,
  resolveCategoryAvailability,
} from "./productCategoryAvailability";

const categories = [
  { id: "drinks", parentId: null },
  { id: "coffee", parentId: "drinks" },
  { id: "latte", parentId: "coffee" },
  { id: "food", parentId: null },
];

describe("category availability by organization", () => {
  it("defaults every category to active", () => {
    const state = resolveCategoryAvailability(categories, []);
    for (const category of categories)
      expect(state(category.id)).toEqual({
        isActive: true,
        effectiveIsActive: true,
        inheritedInactive: false,
      });
  });

  it("inherits disabled ancestors and preserves own settings on reactivation", () => {
    const disabled = resolveCategoryAvailability(categories, [
      { categoryId: "drinks", isActive: false },
      { categoryId: "coffee", isActive: false },
    ]);
    expect(disabled("latte")).toEqual({
      isActive: true,
      effectiveIsActive: false,
      inheritedInactive: true,
    });
    const restored = resolveCategoryAvailability(categories, [
      { categoryId: "coffee", isActive: false },
    ]);
    expect(restored("drinks").effectiveIsActive).toBe(true);
    expect(restored("latte").effectiveIsActive).toBe(false);
    expect(restored("food").effectiveIsActive).toBe(true);
  });

  it("fails closed on cyclic or missing category ancestry", () => {
    expect(
      resolveCategoryAvailability([{ id: "a", parentId: "a" }], [])("a").effectiveIsActive,
    ).toBe(false);
  });

  it("executes the shared SQL predicate for legacy, multiple and uncategorized products", () => {
    // The portable recursive predicate is also compiled with the PostgreSQL dialect.
    // An isolated SQLite database executes it without using any environment credentials.
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(`
        create table product (id text primary key, category_id text);
        create table product_category (id text primary key, parent_id text);
        create table product_category_link (product_id text, category_id text);
        create table organization_product_category (organization_id text, category_id text, is_active boolean);
        create table organization_product (organization_id text, product_id text, is_active boolean);
        insert into product_category values ('drinks', null), ('coffee', 'drinks'), ('latte', 'coffee'), ('food', null);
        insert into product values ('legacy', 'coffee'), ('linked', null), ('multiple', 'coffee'), ('none', null), ('snack', 'food');
        insert into product_category_link values ('linked', 'latte'), ('multiple', 'food');
        insert into organization_product_category values ('branch-a', 'drinks', false), ('branch-a', 'latte', true);
      `);
      const available = (organizationId: string) => {
        const query = new PgDialect().sqlToQuery(sql`select ${productsDB.id} from ${productsDB}
          where ${productCategoryAvailable(productsDB.id, organizationId)} order by ${productsDB.id}`);
        const params = Object.fromEntries(
          query.params.map((value, index) => [`$${index + 1}`, String(value)]),
        );
        return db
          .prepare(query.sql)
          .all(params)
          .map((row) => String(row.id));
      };
      expect(available("branch-a")).toEqual(["multiple", "none", "snack"]);
      expect(available("branch-b")).toEqual(["legacy", "linked", "multiple", "none", "snack"]);
      const orm = drizzle.mock({ schema });
      const catalogQuery = orm.query.productsDB
        .findMany({
          columns: { id: true },
          where: productCategoryAvailable(productsDB.id, "branch-a"),
        })
        .toSQL();
      const catalogBindings = Object.fromEntries(
        catalogQuery.params.map((value, index) => [`$${index + 1}`, String(value)]),
      );
      expect(
        db
          .prepare(catalogQuery.sql)
          .all(catalogBindings)
          .map((row) => row.id)
          .sort(),
      ).toEqual(["multiple", "none", "snack"]);
      db.exec(
        "insert into organization_product values ('branch-a', 'legacy', true), ('branch-a', 'multiple', true)",
      );
      const orderQuery = orm.query.organizationProductDB
        .findMany({
          columns: { productId: true },
          where: (table) => productCategoryAvailable(table.productId, "branch-a"),
        })
        .toSQL();
      const orderBindings = Object.fromEntries(
        orderQuery.params.map((value, index) => [`$${index + 1}`, String(value)]),
      );
      expect(
        db
          .prepare(orderQuery.sql)
          .all(orderBindings)
          .map((row) => row.product_id),
      ).toEqual(["multiple"]);
      const active = new Set(available("branch-a"));
      expect(
        hasAvailableCompoundConfiguration(
          [{ optionProductIds: ["linked", "multiple"] }, { optionProductIds: ["snack"] }],
          active,
        ),
      ).toBe(true);
      expect(
        hasAvailableCompoundConfiguration(
          [{ optionProductIds: ["legacy", "linked"] }, { optionProductIds: ["snack"] }],
          active,
        ),
      ).toBe(false);
      db.exec("delete from organization_product_category where organization_id = 'branch-a'");
      expect(available("branch-a")).toHaveLength(5);
    } finally {
      db.close();
    }
  });
});
