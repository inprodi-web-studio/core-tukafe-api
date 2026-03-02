import { unitsDB } from "@core/db/schemas";
import { buildFuzzySearch, conflict, generateNanoId, getPgError, notFound, paginate } from "@core/utils";
import { asc, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { normalizeUnitInput } from "./units.helpers";
import type { AdminUnitsService } from "./units.types";

export function adminUnitsService(fastify: FastifyInstance): AdminUnitsService {
  return {
    async get(id, { safe = false } = {}) {
      const unit = await fastify.db.query.unitsDB.findFirst({
        where(unitTable, { eq }) {
          return eq(unitTable.id, id);
        },
      });

      if (!unit && !safe) {
        throw notFound("unit.notFound", "The unit was not found");
      }

      if (!unit) {
        return null;
      }

      return unit;
    },

    async list({ search, page, pageSize } = {}) {
      const defaultOrderBy: [SQL, ...SQL[]] = [asc(unitsDB.name), asc(unitsDB.id)];
      const fuzzySearch = buildFuzzySearch({
        query: search,
        values: [unitsDB.name, unitsDB.abbreviation],
        tieBreakers: defaultOrderBy,
      });

      return paginate({
        executor: fastify.db,
        createQuery: () => {
          const query = fastify.db.select().from(unitsDB).$dynamic();

          if (fuzzySearch.where) {
            query.where(fuzzySearch.where);
          }

          return query;
        },
        orderBy: fuzzySearch.orderBy ?? defaultOrderBy,
        page,
        pageSize,
      });
    },

    async create(input) {
      const { name, abbreviation, precision } = normalizeUnitInput(input);

      try {
        const [createdUnit] = await fastify.db
          .insert(unitsDB)
          .values({
            id: generateNanoId(),
            name,
            abbreviation,
            precision,
          })
          .returning();

        if (!createdUnit) {
          throw new Error("Failed to create unit");
        }

        return createdUnit;
      } catch (error) {
        const pgError = getPgError(error);

        if (pgError?.code === "23505") {
          if (pgError.constraint === "unit_name_unique") {
            throw conflict("unit.duplicatedName", "A unit with this name already exists");
          }

          if (pgError.constraint === "unit_abbreviation_unique") {
            throw conflict(
              "unit.duplicatedAbbreviation",
              "A unit with this abbreviation already exists",
            );
          }
        }

        throw error;
      }
    },
  };
}
