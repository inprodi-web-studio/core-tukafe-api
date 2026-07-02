import { sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import { normalizeString } from "@core/utils";
import type {
  CreateProductCategoryServiceParams,
  ProductCategoryListItem,
  UpdateProductCategoryServiceParams,
} from "./productCategories.types";

type ProductCategoryQueryExecutor = Pick<FastifyInstance["db"], "execute">;
type ProductCategoryTreeSource = Pick<
  ProductCategoryListItem,
  "id" | "name" | "icon" | "color" | "sortOrder" | "isFourPlusOneEligible" | "image"
> & { isCashbackEligible: boolean; parentId: string | null };
type ProductCategoryTreeRow = Record<string, unknown> & {
  id: string;
  name: string;
  icon: string;
  color: string;
  sortOrder: number;
  isFourPlusOneEligible: boolean;
  isCashbackEligible: boolean;
  imageId: string | null;
  imageName: string | null;
  imagePath: string | null;
  imageVisibility: "PUBLIC" | "PRIVATE" | null;
  imageMimeType: string | null;
  parentId: string | null;
};

type ProductCategoryRootRow = Record<string, unknown> & {
  id: string;
};

export const normalizeProductCategoryInput = ({
  name,
  icon,
  color,
  imageUploadId,
  parentId,
  isFourPlusOneEligible,
  isCashbackEligible,
  sortOrder,
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

  const normalizedImageUploadId = imageUploadId
    ? normalizeString(imageUploadId, {
        trim: true,
        collapseWhitespace: true,
      })
    : null;

  const normalizedParentId = parentId ?? null;

  return {
    name: normalizedName,
    icon: normalizedIcon,
    color: normalizedColor,
    sortOrder: sortOrder ?? 0,
    isFourPlusOneEligible: isFourPlusOneEligible ?? false,
    isCashbackEligible: isCashbackEligible ?? false,
    imageUploadId: normalizedImageUploadId,
    parentId: normalizedParentId,
  };
};

export const normalizeProductCategoryUpdateInput = ({
  name,
  icon,
  color,
  imageUploadId,
  parentId,
  isFourPlusOneEligible,
  isCashbackEligible,
  sortOrder,
}: UpdateProductCategoryServiceParams) => {
  return {
    ...(name !== undefined && {
      name: normalizeString(name, {
        trim: true,
        collapseWhitespace: true,
      }),
    }),
    ...(icon !== undefined && {
      icon: normalizeString(icon, {
        trim: true,
        collapseWhitespace: true,
      }),
    }),
    ...(color !== undefined && {
      color: normalizeString(color, {
        trim: true,
        uppercase: true,
      }),
    }),
    ...(sortOrder !== undefined && { sortOrder }),
    ...(isFourPlusOneEligible !== undefined && { isFourPlusOneEligible }),
    ...(isCashbackEligible !== undefined && { isCashbackEligible }),
    ...(imageUploadId !== undefined && {
      imageUploadId: imageUploadId
        ? normalizeString(imageUploadId, {
            trim: true,
            collapseWhitespace: true,
          })
        : null,
    }),
    ...(parentId !== undefined && { parentId: parentId ?? null }),
  };
};

function mapProductCategoryTreeRow(row: ProductCategoryTreeRow): ProductCategoryTreeSource {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    sortOrder: row.sortOrder,
    isFourPlusOneEligible: row.isFourPlusOneEligible,
    isCashbackEligible: row.isCashbackEligible,
    parentId: row.parentId,
    image:
      row.imageId && row.imageName && row.imagePath && row.imageVisibility && row.imageMimeType
        ? {
            id: row.imageId,
            name: row.imageName,
            path: row.imagePath,
            visibility: row.imageVisibility,
            mimeType: row.imageMimeType,
          }
        : null,
  };
}

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
      sortOrder: category.sortOrder,
      isFourPlusOneEligible: category.isFourPlusOneEligible,
      isCashbackEligible: category.isCashbackEligible,
      image: category.image,
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
    with recursive category_tree(id, name, icon, color, sort_order, is_four_plus_one_eligible, is_cashback_eligible, image_upload_id, parent_id) as (
      select id, name, icon, color, sort_order, is_four_plus_one_eligible, is_cashback_eligible, image_upload_id, parent_id
      from product_category
      where id in (${sql.join(
        rootIds.map((rootId) => sql`${rootId}`),
        sql`, `,
      )})

      union all

      select child.id, child.name, child.icon, child.color, child.sort_order, child.is_four_plus_one_eligible, child.is_cashback_eligible, child.image_upload_id, child.parent_id
      from product_category as child
      inner join category_tree on child.parent_id = category_tree.id
    )
    select distinct
      category_tree.id,
      category_tree.name,
      category_tree.icon,
      category_tree.color,
      category_tree.sort_order as "sortOrder",
      category_tree.is_four_plus_one_eligible as "isFourPlusOneEligible",
      category_tree.is_cashback_eligible as "isCashbackEligible",
      category_tree.parent_id as "parentId",
      image.id as "imageId",
      image.name as "imageName",
      image.path as "imagePath",
      image.visibility as "imageVisibility",
      image.mime_type as "imageMimeType"
    from category_tree
    left join upload as image on image.id = category_tree.image_upload_id
    order by category_tree.sort_order asc, category_tree.name asc, category_tree.id asc
  `);

  return result.rows.map(mapProductCategoryTreeRow);
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
    with recursive matched_paths(id, name, icon, color, sort_order, is_four_plus_one_eligible, is_cashback_eligible, image_upload_id, parent_id, source_id) as (
      select id, name, icon, color, sort_order, is_four_plus_one_eligible, is_cashback_eligible, image_upload_id, parent_id, id as source_id
      from product_category
      where ${searchWhere}

      union all

      select
        parent.id,
        parent.name,
        parent.icon,
        parent.color,
        parent.sort_order,
        parent.is_four_plus_one_eligible,
        parent.is_cashback_eligible,
        parent.image_upload_id,
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
      matched_paths.sort_order as "sortOrder",
      matched_paths.is_four_plus_one_eligible as "isFourPlusOneEligible",
      matched_paths.is_cashback_eligible as "isCashbackEligible",
      matched_paths.parent_id as "parentId",
      image.id as "imageId",
      image.name as "imageName",
      image.path as "imagePath",
      image.visibility as "imageVisibility",
      image.mime_type as "imageMimeType"
    from matched_paths
    inner join matched_roots on matched_roots.source_id = matched_paths.source_id
    left join upload as image on image.id = matched_paths.image_upload_id
    where matched_roots.root_id in (${sql.join(
      rootIds.map((rootId) => sql`${rootId}`),
      sql`, `,
    )})
    order by matched_paths.sort_order asc, matched_paths.name asc, matched_paths.id asc
  `);

  return result.rows.map(mapProductCategoryTreeRow);
}
