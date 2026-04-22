import { productCategoriesDB } from "@core/db/schemas";
import { asc } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type {
  GuestProductCategoriesService,
  GuestProductCategoryListItem,
} from "./productCategories.types";

interface ProductCategoryTreeSource {
  id: string;
  name: string;
  icon: string;
  color: string;
  parentId: string | null;
}

function buildProductCategoryTree(
  categories: ProductCategoryTreeSource[],
): GuestProductCategoryListItem[] {
  const nodes = new Map<string, GuestProductCategoryListItem>();
  const rootNodes: GuestProductCategoryListItem[] = [];

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

export function guestProductCategoriesService(
  fastify: FastifyInstance,
): GuestProductCategoriesService {
  return {
    async list() {
      const categories = await fastify.db.query.productCategoriesDB.findMany({
        columns: {
          id: true,
          name: true,
          icon: true,
          color: true,
          parentId: true,
        },
        orderBy: [asc(productCategoriesDB.name), asc(productCategoriesDB.id)],
      });

      return buildProductCategoryTree(categories);
    },
  };
}
