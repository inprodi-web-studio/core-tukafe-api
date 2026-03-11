import { suppliersDB } from "@core/db/schemas";
import {
  buildFuzzySearch,
  conflict,
  generateNanoId,
  getPgError,
  notFound,
  paginate,
} from "@core/utils";
import { and, asc, eq, isNull, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { normalizeSupplierInput } from "./suppliers.helpers";
import type { AdminSuppliersService } from "./suppliers.types";

export function adminSuppliersService(fastify: FastifyInstance): AdminSuppliersService {
  return {
    async get(id, { safe = false } = {}) {
      const supplier = await fastify.db.query.suppliersDB.findFirst({
        where: and(eq(suppliersDB.id, id), isNull(suppliersDB.deletedAt)),
        columns: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      });

      if (!supplier && !safe) {
        throw notFound("supplier.notFound", "The supplier was not found");
      }

      if (!supplier) {
        return null;
      }

      return supplier;
    },

    async list({ search, page, pageSize } = {}) {
      const defaultOrderBy: [SQL, ...SQL[]] = [asc(suppliersDB.name), asc(suppliersDB.id)];
      const fuzzySearch = buildFuzzySearch({
        query: search,
        values: [suppliersDB.name, suppliersDB.email, suppliersDB.phone],
        tieBreakers: defaultOrderBy,
      });

      return paginate({
        executor: fastify.db,
        createQuery: () => {
          const query = fastify.db
            .select({
              id: suppliersDB.id,
              name: suppliersDB.name,
              email: suppliersDB.email,
              phone: suppliersDB.phone,
            })
            .from(suppliersDB)
            .$dynamic();

          query.where(
            fuzzySearch.where
              ? and(isNull(suppliersDB.deletedAt), fuzzySearch.where)
              : isNull(suppliersDB.deletedAt),
          );

          return query;
        },
        orderBy: fuzzySearch.orderBy ?? defaultOrderBy,
        page,
        pageSize,
      });
    },

    async create(input) {
      const normalizedInput = normalizeSupplierInput(input);

      try {
        const [createdSupplier] = await fastify.db
          .insert(suppliersDB)
          .values({
            id: generateNanoId(),
            name: normalizedInput.name,
            email: normalizedInput.email,
            phone: normalizedInput.phone,
          })
          .returning();

        if (!createdSupplier) {
          throw new Error("Failed to create supplier");
        }

        const supplier = await fastify.admin.suppliers.get(createdSupplier.id);

        if (!supplier) {
          throw new Error("Failed to retrieve created supplier");
        }

        return supplier;
      } catch (error) {
        const pgError = getPgError(error);

        if (pgError?.code === "23505" && pgError.constraint === "supplier_name_active_unique") {
          throw conflict("supplier.duplicatedName", "A supplier with this name already exists");
        }

        if (pgError?.code === "23505" && pgError.constraint === "supplier_email_active_unique") {
          throw conflict("supplier.duplicatedEmail", "A supplier with this email already exists");
        }

        if (pgError?.code === "23505" && pgError.constraint === "supplier_phone_active_unique") {
          throw conflict("supplier.duplicatedPhone", "A supplier with this phone already exists");
        }

        throw error;
      }
    },
  };
}
