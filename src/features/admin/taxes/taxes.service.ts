import { taxDB } from "@core/db/schemas";
import { buildFuzzySearch, conflict, generateNanoId, getPgError, paginate } from "@core/utils";
import { asc, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { normalizeTaxInput } from "./taxes.helpers";
import type { AdminTaxesService } from "./taxes.types";

export function adminTaxesService(fastify: FastifyInstance): AdminTaxesService {
  return {
    async list({ search, page, pageSize } = {}) {
      const defaultOrderBy: [SQL, ...SQL[]] = [asc(taxDB.name), asc(taxDB.id)];
      const fuzzySearch = buildFuzzySearch({
        query: search,
        values: [taxDB.name],
        tieBreakers: defaultOrderBy,
        threshold: 0.5,
      });

      return paginate({
        executor: fastify.db,
        createQuery: () => {
          const query = fastify.db.select().from(taxDB).$dynamic();

          if (fuzzySearch.where) {
            query.where(fuzzySearch.where);
          }

          return query;
        },
        orderBy: fuzzySearch.orderBy ?? defaultOrderBy,
        page: page,
        pageSize: pageSize,
      });
    },

    async create(input) {
      const { name, rate } = normalizeTaxInput(input);

      try {
        const [createdTax] = await fastify.db
          .insert(taxDB)
          .values({
            id: generateNanoId(),
            name,
            rate,
          })
          .returning();

        if (!createdTax) {
          throw new Error("Failed to create tax");
        }

        return createdTax;
      } catch (error) {
        const pgError = getPgError(error);

        if (pgError?.code === "23505" && pgError.constraint === "tax_name_unique") {
          throw conflict("tax.duplicatedName", "A tax with this name already exists");
        }

        throw error;
      }
    },
  };
}
