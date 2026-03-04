import { variationGroupOptionsDB, variationGroupsDB } from "@core/db/schemas";
import {
  assertUniqueValues,
  buildFuzzySearch,
  conflict,
  generateNanoId,
  getPgError,
  notFound,
  paginate,
} from "@core/utils";
import { asc, sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { mapVariationGroupResponse, normalizeVariationGroupInput } from "./variationGroups.helpers";
import type { AdminVariationGroupsService } from "./variationGroups.types";

export function adminVariationGroupsService(fastify: FastifyInstance): AdminVariationGroupsService {
  return {
    async get(id, { safe = false } = {}) {
      const variationGroup = await fastify.db.query.variationGroupsDB.findFirst({
        where(table, { eq }) {
          return eq(table.id, id);
        },
        with: {
          options: true,
        },
      });

      if (!variationGroup && !safe) {
        throw notFound("variationGroup.notFound", "The variation group was not found");
      }

      if (!variationGroup) {
        return null;
      }

      return mapVariationGroupResponse(variationGroup);
    },

    async list({ search, page, pageSize } = {}) {
      const defaultOrderBy: [SQL, ...SQL[]] = [
        asc(variationGroupsDB.sortOrder),
        asc(variationGroupsDB.name),
        asc(variationGroupsDB.id),
      ];
      const fuzzySearch = buildFuzzySearch({
        query: search,
        values: [variationGroupsDB.name],
        tieBreakers: defaultOrderBy,
      });

      const paginatedVariationGroups = await paginate({
        executor: fastify.db,
        createQuery: () => {
          const query = fastify.db.select().from(variationGroupsDB).$dynamic();

          if (fuzzySearch.where) {
            query.where(fuzzySearch.where);
          }

          return query;
        },
        orderBy: fuzzySearch.orderBy ?? defaultOrderBy,
        page,
        pageSize,
      });

      if (paginatedVariationGroups.data.length === 0) {
        return {
          data: [],
          pagination: paginatedVariationGroups.pagination,
        };
      }

      const variationGroupIds = paginatedVariationGroups.data.map(
        (variationGroup) => variationGroup.id,
      );

      const variationGroupOptions = await fastify.db.query.variationGroupOptionsDB.findMany({
        where(table, { inArray }) {
          return inArray(table.variationGroupId, variationGroupIds);
        },
      });

      const optionsByGroupId = new Map<string, typeof variationGroupOptions>();

      for (const option of variationGroupOptions) {
        const currentOptions = optionsByGroupId.get(option.variationGroupId) ?? [];

        currentOptions.push(option);
        optionsByGroupId.set(option.variationGroupId, currentOptions);
      }

      return {
        data: paginatedVariationGroups.data.map((variationGroup) =>
          mapVariationGroupResponse({
            ...variationGroup,
            options: optionsByGroupId.get(variationGroup.id) ?? [],
          }),
        ),
        pagination: paginatedVariationGroups.pagination,
      };
    },

    async create(input) {
      const { name, options } = normalizeVariationGroupInput(input);

      assertUniqueValues(
        options.map((option) => option.name),
        "variationGroup.duplicateOptionName",
        "Variation group options cannot contain duplicate names",
      );

      assertUniqueValues(
        options.map((option) => option.sortOrder.toString()),
        "variationGroup.duplicateOptionSortOrder",
        "Variation group options cannot contain duplicate sort orders",
      );

      try {
        const createdVariationGroupId = await fastify.db.transaction(async (tx) => {
          const [nextSortOrderRow] = await tx
            .select({
              nextSortOrder: sql<number>`coalesce(max(${variationGroupsDB.sortOrder}), -1) + 1`,
            })
            .from(variationGroupsDB);

          const nextSortOrder = nextSortOrderRow?.nextSortOrder ?? 0;

          const [createdVariationGroup] = await tx
            .insert(variationGroupsDB)
            .values({
              id: generateNanoId(),
              name,
              sortOrder: nextSortOrder,
            })
            .returning();

          if (!createdVariationGroup) {
            throw new Error("Failed to create variation group");
          }

          await tx.insert(variationGroupOptionsDB).values(
            options.map((option) => ({
              id: generateNanoId(),
              variationGroupId: createdVariationGroup.id,
              name: option.name,
              sortOrder: option.sortOrder,
            })),
          );

          return createdVariationGroup.id;
        });

        const createdVariationGroup =
          await fastify.admin.variationGroups.get(createdVariationGroupId);

        if (!createdVariationGroup) {
          throw new Error("Failed to retrieve created variation group");
        }

        return createdVariationGroup;
      } catch (error) {
        const pgError = getPgError(error);

        if (pgError?.code === "23505") {
          if (pgError.constraint === "variation_group_name_unique") {
            throw conflict(
              "variationGroup.duplicatedName",
              "A variation group with this name already exists",
            );
          }

          if (pgError.constraint === "variation_group_sort_order_unique") {
            throw conflict(
              "variationGroup.duplicatedSortOrder",
              "A variation group with this sort order already exists",
            );
          }

          if (pgError.constraint === "variation_group_option_group_name_unique") {
            throw conflict(
              "variationGroup.duplicatedOptionName",
              "A variation group option with this name already exists in the group",
            );
          }

          if (pgError.constraint === "variation_group_option_group_sort_order_unique") {
            throw conflict(
              "variationGroup.duplicatedOptionSortOrder",
              "A variation group option with this sort order already exists in the group",
            );
          }
        }

        throw error;
      }
    },
  };
}
