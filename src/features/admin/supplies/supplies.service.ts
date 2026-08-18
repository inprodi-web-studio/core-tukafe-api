import {
  modifierOptionSuppliesDB,
  recipeSuppliesDB,
  supplierItemsDB,
  suppliesDB,
  supplyCategoriesDB,
  unitsDB,
  variationRecipeSuppliesDB,
} from "@core/db/schemas";
import {
  buildFuzzySearch,
  conflict,
  generateNanoId,
  getPgError,
  notFound,
  paginate,
} from "@core/utils";
import { and, asc, countDistinct, eq, getTableColumns, isNull, sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { normalizeSupplyInput, normalizeSupplyUpdateInput } from "./supplies.helpers";
import type { AdminSuppliesService } from "./supplies.types";

export function adminSuppliesService(fastify: FastifyInstance): AdminSuppliesService {
  return {
    async get(id, { safe = false } = {}) {
      const supply = await fastify.db.query.suppliesDB.findFirst({
        where(supplyTable, { and, eq, isNull }) {
          return and(eq(supplyTable.id, id), isNull(supplyTable.deletedAt));
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
            .innerJoin(supplyCategoriesDB, eq(suppliesDB.categoryId, supplyCategoriesDB.id))
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
      const normalizedInput = normalizeSupplyInput(input);
      const { name, categoryId, baseCostPerUnit, description, baseUnitId } = normalizedInput;

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
            isInventoryTracked: normalizedInput.isInventoryTracked ?? true,
            tracksLots: normalizedInput.tracksLots ?? false,
            isPerishable: normalizedInput.isPerishable ?? false,
            expirationWarningDays: normalizedInput.expirationWarningDays ?? 3,
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

    async update(id, input) {
      await fastify.admin.supplies.get(id);
      const normalizedInput = normalizeSupplyUpdateInput(input);

      if (
        normalizedInput.isInventoryTracked !== undefined ||
        normalizedInput.tracksLots !== undefined ||
        normalizedInput.isPerishable !== undefined
      ) {
        const result = await fastify.db.execute(sql`
          select exists(
            select 1 from inventory_balance
            where inventory_item_id = ${`inv_sup_${id}`}
              and (on_hand_quantity <> 0 or reserved_quantity <> 0)
          ) as "hasStock"
        `);
        if (result.rows[0]?.hasStock) {
          throw conflict(
            "inventory.itemConfigurationHasStock",
            "Inventory tracking and lot configuration can only change with zero balances",
          );
        }
      }

      if (normalizedInput.baseUnitId) {
        await fastify.admin.units.get(normalizedInput.baseUnitId);
      }
      if (normalizedInput.categoryId) {
        await fastify.admin.supplyCategories.get(normalizedInput.categoryId);
      }

      try {
        const [updated] = await fastify.db
          .update(suppliesDB)
          .set({ ...normalizedInput, updatedAt: sql`now()` })
          .where(and(eq(suppliesDB.id, id), isNull(suppliesDB.deletedAt)))
          .returning({ id: suppliesDB.id });

        if (!updated) throw notFound("supply.notFound", "The supply was not found");

        const supply = await fastify.admin.supplies.get(updated.id);
        if (!supply) throw new Error("Failed to retrieve updated supply");
        return supply;
      } catch (error) {
        const pgError = getPgError(error);
        if (pgError?.code === "23505" && pgError.constraint === "supply_name_active_unique") {
          throw conflict("supply.duplicatedName", "A supply with this name already exists");
        }
        throw error;
      }
    },

    async remove(id) {
      await fastify.db.transaction(async (tx) => {
        const [supply] = await tx
          .select({ id: suppliesDB.id })
          .from(suppliesDB)
          .where(eq(suppliesDB.id, id))
          .limit(1)
          .for("update");
        if (!supply) throw notFound("supply.notFound", "The supply was not found");

        const [productRecipes] = await tx
          .select({ count: countDistinct(recipeSuppliesDB.recipeId) })
          .from(recipeSuppliesDB)
          .where(eq(recipeSuppliesDB.supplyId, id));
        const [variationRecipes] = await tx
          .select({ count: countDistinct(variationRecipeSuppliesDB.variationId) })
          .from(variationRecipeSuppliesDB)
          .where(eq(variationRecipeSuppliesDB.supplyId, id));
        const [modifierOptions] = await tx
          .select({ count: countDistinct(modifierOptionSuppliesDB.modifierOptionId) })
          .from(modifierOptionSuppliesDB)
          .where(eq(modifierOptionSuppliesDB.supplyId, id));
        const [supplierLinks] = await tx
          .select({ count: countDistinct(supplierItemsDB.id) })
          .from(supplierItemsDB)
          .where(eq(supplierItemsDB.supplyId, id));

        const dependencies = {
          productRecipes: Number(productRecipes?.count ?? 0),
          variationRecipes: Number(variationRecipes?.count ?? 0),
          modifierOptions: Number(modifierOptions?.count ?? 0),
          supplierLinks: Number(supplierLinks?.count ?? 0),
        };
        if (Object.values(dependencies).some((count) => count > 0)) {
          throw conflict(
            "supply.inUse",
            "The supply is still used by recipes, modifiers or suppliers",
            dependencies,
          );
        }

        await tx.delete(suppliesDB).where(eq(suppliesDB.id, id));
      });
    },
  };
}
