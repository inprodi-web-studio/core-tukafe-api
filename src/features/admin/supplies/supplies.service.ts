import { suppliesDB, supplyCategoriesDB, unitsDB } from "@core/db/schemas";
import {
  buildFuzzySearch,
  conflict,
  generateNanoId,
  getPgError,
  notFound,
  paginate,
} from "@core/utils";
import { and, asc, eq, getTableColumns, isNull, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { normalizeSupplyInput } from "./supplies.helpers";
import type { AdminSuppliesService } from "./supplies.types";

export function adminSuppliesService(fastify: FastifyInstance): AdminSuppliesService {
  return {
    async get(id, { safe = false } = {}) {
      const supply = await fastify.db.query.suppliesDB.findFirst({
        where(supplyTable, { eq }) {
          return eq(supplyTable.id, id);
        },
        columns: {
          baseUnitId: false,
          categoryId: false,
        },
        with: {
          baseUnit: true,
          category: true,
        },
      });

      if (!supply && !safe) {
        throw notFound("supply.notFound", "The supply was not found");
      }

      if (!supply) {
        return null;
      }

      return supply;
    },

    async list({ search, page, pageSize } = {}) {
      const defaultOrderBy: [SQL, ...SQL[]] = [asc(suppliesDB.name), asc(suppliesDB.id)];
      const fuzzySearch = buildFuzzySearch({
        query: search,
        values: [
          suppliesDB.name,
          suppliesDB.description,
          supplyCategoriesDB.name,
          unitsDB.name,
          unitsDB.abbreviation,
        ],
        tieBreakers: defaultOrderBy,
      });

      return paginate({
        executor: fastify.db,
        createQuery: () => {
          const {
            baseUnitId: omittedBaseUnitId,
            categoryId: omittedCategoryId,
            ...supplyColumns
          } = getTableColumns(suppliesDB);
          void omittedBaseUnitId;
          void omittedCategoryId;

          const query = fastify.db
            .select({
              ...supplyColumns,
              baseUnit: unitsDB,
              category: supplyCategoriesDB,
            })
            .from(suppliesDB)
            .innerJoin(unitsDB, eq(suppliesDB.baseUnitId, unitsDB.id))
            .innerJoin(
              supplyCategoriesDB,
              eq(suppliesDB.categoryId, supplyCategoriesDB.id),
            )
            .$dynamic();

          query.where(
            fuzzySearch.where
              ? and(isNull(suppliesDB.deletedAt), fuzzySearch.where)
              : isNull(suppliesDB.deletedAt),
          );

          return query;
        },
        orderBy: fuzzySearch.orderBy ?? defaultOrderBy,
        page,
        pageSize,
      });
    },

    async create(input) {
      const { name, categoryId, baseCostPerUnit, description, baseUnitId } =
        normalizeSupplyInput(input);

      await fastify.admin.units.get(baseUnitId);
      await fastify.admin.supplyCategories.get(categoryId);

      try {
        const [createdSupply] = await fastify.db
          .insert(suppliesDB)
          .values({
            id: generateNanoId(),
            name,
            categoryId,
            baseCostPerUnit,
            description,
            baseUnitId,
          })
          .returning();

        if (!createdSupply) {
          throw new Error("Failed to create supply");
        }

        const supply = await fastify.admin.supplies.get(createdSupply.id);

        if (!supply) {
          throw new Error("Failed to retrieve created supply");
        }

        return supply;
      } catch (error) {
        const pgError = getPgError(error);

        if (pgError?.code === "23505" && pgError.constraint === "supply_name_active_unique") {
          throw conflict("supply.duplicatedName", "A supply with this name already exists");
        }

        throw error;
      }
    },
  };
}
