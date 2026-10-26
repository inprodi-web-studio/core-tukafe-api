import { organizationProductCategoriesDB, productCategoriesDB } from "@core/db/schemas";
import { eq, sql, type SQLWrapper } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

/** A disabled ancestor overrides the category's own setting, without changing it. */
export function resolveCategoryAvailability(
  categories: Array<{ id: string; parentId: string | null }>,
  settings: Array<{ categoryId: string; isActive: boolean }>,
) {
  const parents = new Map(categories.map((category) => [category.id, category.parentId]));
  const own = new Map(settings.map((setting) => [setting.categoryId, setting.isActive]));
  const state = (id: string) => {
    const visited = new Set<string>();
    let current: string | null | undefined = id;
    while (current) {
      if (visited.has(current) || !parents.has(current) || own.get(current) === false) return false;
      visited.add(current);
      current = parents.get(current);
    }
    return true;
  };
  return (id: string) => ({
    isActive: own.get(id) ?? true,
    effectiveIsActive: state(id),
    inheritedInactive: Boolean(parents.get(id)) && !state(parents.get(id)!),
  });
}

export async function getCategoryAvailability(fastify: FastifyInstance, organizationId: string) {
  const [categories, settings] = await Promise.all([
    fastify.db
      .select({ id: productCategoriesDB.id, parentId: productCategoriesDB.parentId })
      .from(productCategoriesDB),
    fastify.db
      .select({
        categoryId: organizationProductCategoriesDB.categoryId,
        isActive: organizationProductCategoriesDB.isActive,
      })
      .from(organizationProductCategoriesDB)
      .where(eq(organizationProductCategoriesDB.organizationId, organizationId)),
  ]);
  return resolveCategoryAvailability(categories, settings);
}

/** Correlated predicate: no categories, or at least one category outside a disabled branch.
 * Shared by catalog, compound options, configuration and final order validation.
 * Includes both the many-to-many relation and the legacy categoryId.
 */
export function productCategoryAvailable(productId: SQLWrapper, organizationId: string) {
  return sql`exists (
    with recursive disabled_categories(id) as (
      select category_id from organization_product_category
      where organization_id = ${organizationId} and is_active = false
      union
      select child.id from product_category child
      inner join disabled_categories parent on child.parent_id = parent.id
    ), assigned_categories(id) as (
      select category_id from product_category_link where product_id = ${productId}
      union
      select legacy_product.category_id from product legacy_product
      where legacy_product.id = ${productId} and legacy_product.category_id is not null
    )
    select 1 where not exists (select 1 from assigned_categories)
      or exists (
        select 1 from assigned_categories assigned
        where not exists (select 1 from disabled_categories disabled where disabled.id = assigned.id)
      )
  )`;
}
