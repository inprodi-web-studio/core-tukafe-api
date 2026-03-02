import { sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import { normalizeString } from "@core/utils";
import type {
  CreateProductCategoryServiceParams,
  ProductCategoryListItem,
} from "./productCategories.types";

type ProductCategoryQueryExecutor = Pick<FastifyInstance["db"], "execute">;
type ProductCategoryTreeSource = Pick<ProductCategoryListItem, "id" | "name" | "icon" | "color"> & {
  parentId: string | null;
};
type ProductCategoryTreeRow = Record<string, unknown> & {
  id: string;
  name: string;
  icon: string;
  color: string;
  parentId: string | null;
};

type ProductCategoryRootRow = Record<string, unknown> & {
  id: string;
};

export const normalizeProductCategoryInput = ({
  name,
  icon,
  color,
  parentId,
}: CreateProductCategoryServiceParams) => {
  const normalizedName = normalizeString(name, {
    trim: true,
    collapseWhitespace: true,
  });

  const normalizedIcon = normalizeString(icon, {
    trim: true,
    collapseWhitespace: true,
  });

  const normalizedColor = normalizeString(color, {
    trim: true,
    uppercase: true,
  });

  const normalizedParentId = parentId ?? null;

  return {
    name: normalizedName,
    icon: normalizedIcon,
    color: normalizedColor,
    parentId: normalizedParentId,
  };
};

export function buildProductCategoryTree(
  categories: ProductCategoryTreeSource[],
): ProductCategoryListItem[] {
  const nodes = new Map<string, ProductCategoryListItem>();
  const rootNodes: ProductCategoryListItem[] = [];

  for (const category of categories) {
    nodes.set(category.id, {
      id: category.id,
      name: category.name,
      icon: category.icon,
      color: category.color,
      children: [],
    });
  }

  for (const category of categories) {
    const node = nodes.get(category.id);

    if (!node) {
      continue;
    }

    if (!category.parentId) {
      rootNodes.push(node);
      continue;
    }

    const parentNode = nodes.get(category.parentId);

    if (!parentNode) {
      rootNodes.push(node);
      continue;
    }

    parentNode.children.push(node);
  }

  return rootNodes;
}

export async function getDescendantTreeRows(
  database: ProductCategoryQueryExecutor,
  rootIds: string[],
): Promise<ProductCategoryTreeSource[]> {
  if (rootIds.length === 0) {
    return [];
  }

  const result = await database.execute<ProductCategoryTreeRow>(sql`
    with recursive category_tree(id, name, icon, color, parent_id) as (
      select id, name, icon, color, parent_id
      from product_category
      where id in (${sql.join(
        rootIds.map((rootId) => sql`${rootId}`),
        sql`, `,
      )})

      union all

      select child.id, child.name, child.icon, child.color, child.parent_id
      from product_category as child
      inner join category_tree on child.parent_id = category_tree.id
    )
    select distinct
      id,
      name,
      icon,
      color,
      parent_id as "parentId"
    from category_tree
    order by name asc, id asc
  `);

  return result.rows;
}

export async function getMatchedRootIds(
  database: ProductCategoryQueryExecutor,
  searchWhere: SQL<boolean>,
): Promise<string[]> {
  const result = await database.execute<ProductCategoryRootRow>(sql`
    with recursive matched_paths(id, parent_id) as (
      select id, parent_id
      from product_category
      where ${searchWhere}

      union all

      select parent.id, parent.parent_id
      from product_category as parent
      inner join matched_paths on matched_paths.parent_id = parent.id
    )
    select distinct id
    from matched_paths
    where parent_id is null
    order by id asc
  `);

  return result.rows.map((row) => row.id);
}

export async function getMatchedAncestorRows(
  database: ProductCategoryQueryExecutor,
  searchWhere: SQL<boolean>,
  rootIds: string[],
): Promise<ProductCategoryTreeSource[]> {
  if (rootIds.length === 0) {
    return [];
  }

  const result = await database.execute<ProductCategoryTreeRow>(sql`
    with recursive matched_paths(id, name, icon, color, parent_id, source_id) as (
      select id, name, icon, color, parent_id, id as source_id
      from product_category
      where ${searchWhere}

      union all

      select
        parent.id,
        parent.name,
        parent.icon,
        parent.color,
        parent.parent_id,
        matched_paths.source_id
      from product_category as parent
      inner join matched_paths on matched_paths.parent_id = parent.id
    ),
    matched_roots as (
      select distinct source_id, id as root_id
      from matched_paths
      where parent_id is null
    )
    select distinct
      matched_paths.id,
      matched_paths.name,
      matched_paths.icon,
      matched_paths.color,
      matched_paths.parent_id as "parentId"
    from matched_paths
    inner join matched_roots on matched_roots.source_id = matched_paths.source_id
    where matched_roots.root_id in (${sql.join(
      rootIds.map((rootId) => sql`${rootId}`),
      sql`, `,
    )})
    order by matched_paths.name asc, matched_paths.id asc
  `);

  return result.rows;
}
