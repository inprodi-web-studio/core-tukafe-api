import {
  ingredientsDB,
  supplierItemPresentationsDB,
  supplierItemsDB,
  supplierPresentationCostsDB,
  suppliersDB,
  suppliesDB,
  unitsDB,
  userDB,
} from "@core/db/schemas";
import {
  badRequest,
  conflict,
  generateNanoId,
  getPgError,
  hasAtMostDecimalPlaces,
  notFound,
  normalizeString,
  paginate,
} from "@core/utils";
import { and, asc, desc, eq, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { normalizeSupplierInput, normalizeSupplierUpdateInput } from "./suppliers.helpers";
import type {
  AdminSuppliersService,
  PresentationInput,
  SupplierCostResponse,
  SupplierItemResponse,
  SupplierItemType,
  SupplierPresentationResponse,
  SupplierResponse,
} from "./suppliers.types";

const ingredientCount = sql<number>`(
  select count(*)::int from ${supplierItemsDB} supplier_ingredient
  where supplier_ingredient.supplier_id = ${suppliersDB.id}
    and supplier_ingredient.ingredient_id is not null
    and supplier_ingredient.deleted_at is null
)`;
const supplyCount = sql<number>`(
  select count(*)::int from ${supplierItemsDB} supplier_supply
  where supplier_supply.supplier_id = ${suppliersDB.id}
    and supplier_supply.supply_id is not null
    and supplier_supply.deleted_at is null
)`;

function mapSupplier(row: {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  deletedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  ingredientCount: number;
  supplyCount: number;
}): SupplierResponse {
  if (!row.createdAt || !row.updatedAt) throw new Error("Supplier timestamps are missing");
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    status: row.deletedAt ? "inactive" : "active",
    ingredientCount: Number(row.ingredientCount),
    supplyCount: Number(row.supplyCount),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapSupplierConflict(error: unknown): never {
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

function normalizePresentation(input: PresentationInput) {
  return {
    name: normalizeString(input.name, { trim: true, collapseWhitespace: true }),
    contentQuantity: input.contentQuantity,
    priceCents: input.priceCents,
    note: input.note
      ? normalizeString(input.note, { trim: true, collapseWhitespace: true }) || null
      : null,
    isDefault: input.isDefault ?? false,
  };
}

function unitCost(priceCents: number, quantity: number): number {
  return Number((priceCents / 100 / quantity).toFixed(6));
}

export function adminSuppliersService(fastify: FastifyInstance): AdminSuppliersService {
  async function getSupplierItem(
    supplierId: string,
    supplierItemId: string,
    includeInactive = false,
  ) {
    const [row] = await fastify.db
      .select({
        id: supplierItemsDB.id,
        supplierId: supplierItemsDB.supplierId,
        ingredientId: supplierItemsDB.ingredientId,
        supplyId: supplierItemsDB.supplyId,
        deletedAt: supplierItemsDB.deletedAt,
        createdAt: supplierItemsDB.createdAt,
        updatedAt: supplierItemsDB.updatedAt,
        itemId: sql<string>`coalesce(${ingredientsDB.id}, ${suppliesDB.id})`,
        itemName: sql<string>`coalesce(${ingredientsDB.name}, ${suppliesDB.name})`,
        unitId: unitsDB.id,
        unitName: unitsDB.name,
        unitAbbreviation: unitsDB.abbreviation,
        unitPrecision: unitsDB.precision,
      })
      .from(supplierItemsDB)
      .leftJoin(ingredientsDB, eq(supplierItemsDB.ingredientId, ingredientsDB.id))
      .leftJoin(suppliesDB, eq(supplierItemsDB.supplyId, suppliesDB.id))
      .innerJoin(
        unitsDB,
        or(eq(unitsDB.id, ingredientsDB.baseUnitId), eq(unitsDB.id, suppliesDB.baseUnitId)),
      )
      .where(
        and(
          eq(supplierItemsDB.id, supplierItemId),
          eq(supplierItemsDB.supplierId, supplierId),
          ...(includeInactive ? [] : [isNull(supplierItemsDB.deletedAt)]),
        ),
      )
      .limit(1);

    if (!row) throw notFound("supplier.itemNotFound", "The supplier item was not found");
    return row;
  }

  async function getPresentation(
    supplierId: string,
    supplierItemId: string,
    presentationId: string,
    includeInactive = false,
  ) {
    await getSupplierItem(supplierId, supplierItemId, includeInactive);
    const [presentation] = await fastify.db
      .select()
      .from(supplierItemPresentationsDB)
      .where(
        and(
          eq(supplierItemPresentationsDB.id, presentationId),
          eq(supplierItemPresentationsDB.supplierItemId, supplierItemId),
          ...(includeInactive ? [] : [isNull(supplierItemPresentationsDB.deletedAt)]),
        ),
      )
      .limit(1);
    if (!presentation) {
      throw notFound("supplier.presentationNotFound", "The supplier presentation was not found");
    }
    return presentation;
  }

  async function listPresentations(
    supplierItemId: string,
  ): Promise<SupplierPresentationResponse[]> {
    const rows = await fastify.db
      .select({
        id: supplierItemPresentationsDB.id,
        name: supplierItemPresentationsDB.name,
        contentQuantity: supplierItemPresentationsDB.contentQuantity,
        isDefault: supplierItemPresentationsDB.isDefault,
        deletedAt: supplierItemPresentationsDB.deletedAt,
        createdAt: supplierItemPresentationsDB.createdAt,
        updatedAt: supplierItemPresentationsDB.updatedAt,
        costId: supplierPresentationCostsDB.id,
        priceCents: supplierPresentationCostsDB.priceCents,
        effectiveFrom: supplierPresentationCostsDB.effectiveFrom,
        effectiveTo: supplierPresentationCostsDB.effectiveTo,
        note: supplierPresentationCostsDB.note,
        userId: userDB.id,
        userName: userDB.name,
        userEmail: userDB.email,
      })
      .from(supplierItemPresentationsDB)
      .leftJoin(
        supplierPresentationCostsDB,
        and(
          eq(supplierPresentationCostsDB.presentationId, supplierItemPresentationsDB.id),
          isNull(supplierPresentationCostsDB.effectiveTo),
        ),
      )
      .leftJoin(userDB, eq(supplierPresentationCostsDB.createdByUserId, userDB.id))
      .where(eq(supplierItemPresentationsDB.supplierItemId, supplierItemId))
      .orderBy(
        asc(supplierItemPresentationsDB.deletedAt),
        desc(supplierItemPresentationsDB.isDefault),
        asc(supplierItemPresentationsDB.name),
      );

    return rows.map((row) => {
      if (!row.createdAt || !row.updatedAt) {
        throw new Error("Supplier presentation timestamps are missing");
      }
      return {
        id: row.id,
        name: row.name,
        contentQuantity: Number(row.contentQuantity),
        isDefault: row.isDefault,
        status: row.deletedAt ? "inactive" : "active",
        currentCost:
          row.costId && row.priceCents !== null && row.effectiveFrom
            ? {
                id: row.costId,
                priceCents: row.priceCents,
                unitCostPerBaseUnit: unitCost(row.priceCents, Number(row.contentQuantity)),
                effectiveFrom: row.effectiveFrom,
                effectiveTo: row.effectiveTo,
                note: row.note,
                createdBy:
                  row.userId && row.userName && row.userEmail
                    ? { id: row.userId, name: row.userName, email: row.userEmail }
                    : null,
              }
            : null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });
  }

  async function mapItem(
    row: Awaited<ReturnType<typeof getSupplierItem>>,
  ): Promise<SupplierItemResponse> {
    if (!row.createdAt || !row.updatedAt) throw new Error("Supplier item timestamps are missing");
    return {
      id: row.id,
      itemType: row.ingredientId ? "ingredient" : "supply",
      status: row.deletedAt ? "inactive" : "active",
      item: {
        id: row.itemId,
        name: row.itemName,
        baseUnit: {
          id: row.unitId,
          name: row.unitName,
          abbreviation: row.unitAbbreviation,
          precision: row.unitPrecision,
        },
      },
      presentations: await listPresentations(row.id),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async function assertActiveSupplier(supplierId: string) {
    const supplier = await service.get(supplierId, { includeInactive: true });
    if (!supplier) throw notFound("supplier.notFound", "The supplier was not found");
    if (supplier.status === "inactive") {
      throw conflict("supplier.inactive", "Restore the supplier before changing its catalog");
    }
  }

  async function validateQuantity(itemType: SupplierItemType, itemId: string, quantity: number) {
    const itemTable = itemType === "ingredient" ? ingredientsDB : suppliesDB;
    const [item] = await fastify.db
      .select({ id: itemTable.id, precision: unitsDB.precision })
      .from(itemTable)
      .innerJoin(unitsDB, eq(itemTable.baseUnitId, unitsDB.id))
      .where(and(eq(itemTable.id, itemId), isNull(itemTable.deletedAt)))
      .limit(1);
    if (!item) throw notFound(`supplier.${itemType}NotFound`, "The selected item was not found");
    if (!hasAtMostDecimalPlaces(quantity, item.precision)) {
      throw badRequest(
        "supplier.invalidContentPrecision",
        `Content quantity supports at most ${item.precision} decimal places`,
      );
    }
    return item;
  }

  const service: AdminSuppliersService = {
    async get(id, { safe = false, includeInactive = false } = {}) {
      const [supplier] = await fastify.db
        .select({
          id: suppliersDB.id,
          name: suppliersDB.name,
          email: suppliersDB.email,
          phone: suppliersDB.phone,
          deletedAt: suppliersDB.deletedAt,
          createdAt: suppliersDB.createdAt,
          updatedAt: suppliersDB.updatedAt,
          ingredientCount,
          supplyCount,
        })
        .from(suppliersDB)
        .where(
          and(eq(suppliersDB.id, id), ...(includeInactive ? [] : [isNull(suppliersDB.deletedAt)])),
        )
        .limit(1);
      if (!supplier && !safe) throw notFound("supplier.notFound", "The supplier was not found");
      return supplier ? mapSupplier(supplier) : null;
    },

    async list({ search, page, pageSize, status = "active" } = {}) {
      const normalizedSearch = search?.trim();
      return paginate({
        executor: fastify.db,
        createQuery: () => {
          const filters: SQL[] = [];
          if (status === "active") filters.push(isNull(suppliersDB.deletedAt));
          if (status === "inactive") filters.push(isNotNull(suppliersDB.deletedAt));
          if (normalizedSearch) {
            const pattern = `%${normalizedSearch}%`;
            const searchFilter = or(
              ilike(suppliersDB.name, pattern),
              ilike(suppliersDB.email, pattern),
              ilike(suppliersDB.phone, pattern),
            );
            if (searchFilter) filters.push(searchFilter);
          }
          return fastify.db
            .select({
              id: suppliersDB.id,
              name: suppliersDB.name,
              email: suppliersDB.email,
              phone: suppliersDB.phone,
              deletedAt: suppliersDB.deletedAt,
              createdAt: suppliersDB.createdAt,
              updatedAt: suppliersDB.updatedAt,
              ingredientCount,
              supplyCount,
            })
            .from(suppliersDB)
            .where(filters.length ? and(...filters) : undefined)
            .$dynamic();
        },
        orderBy: [asc(suppliersDB.name), asc(suppliersDB.id)],
        page,
        pageSize: pageSize ?? 20,
        mapRow: mapSupplier,
      });
    },

    async create(input) {
      const normalizedInput = normalizeSupplierInput(input);
      try {
        const [created] = await fastify.db
          .insert(suppliersDB)
          .values({ id: generateNanoId(), ...normalizedInput })
          .returning({ id: suppliersDB.id });
        if (!created) throw new Error("Failed to create supplier");
        return (await service.get(created.id)) as SupplierResponse;
      } catch (error) {
        mapSupplierConflict(error);
      }
    },

    async update(id, input) {
      await service.get(id, { includeInactive: true });
      try {
        const [updated] = await fastify.db
          .update(suppliersDB)
          .set({ ...normalizeSupplierUpdateInput(input), updatedAt: new Date() })
          .where(eq(suppliersDB.id, id))
          .returning({ id: suppliersDB.id });
        if (!updated) throw notFound("supplier.notFound", "The supplier was not found");
        return (await service.get(id, { includeInactive: true })) as SupplierResponse;
      } catch (error) {
        mapSupplierConflict(error);
      }
    },

    async deactivate(id) {
      await fastify.db.transaction(async (tx) => {
        const [supplier] = await tx
          .select({ id: suppliersDB.id, deletedAt: suppliersDB.deletedAt })
          .from(suppliersDB)
          .where(eq(suppliersDB.id, id))
          .limit(1)
          .for("update");
        if (!supplier) throw notFound("supplier.notFound", "The supplier was not found");
        if (supplier.deletedAt) return;
        await tx
          .update(suppliersDB)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(suppliersDB.id, id));
      });
    },

    async restore(id) {
      await fastify.db.transaction(async (tx) => {
        const [supplier] = await tx
          .select()
          .from(suppliersDB)
          .where(eq(suppliersDB.id, id))
          .limit(1)
          .for("update");
        if (!supplier) throw notFound("supplier.notFound", "The supplier was not found");
        if (!supplier.deletedAt) return;
        try {
          await tx
            .update(suppliersDB)
            .set({ deletedAt: null, updatedAt: new Date() })
            .where(eq(suppliersDB.id, id));
        } catch (error) {
          mapSupplierConflict(error);
        }
      });
      return (await service.get(id)) as SupplierResponse;
    },

    async listItems(supplierId, { itemType, search, page, pageSize, status = "active" }) {
      await service.get(supplierId, { includeInactive: true });
      const itemTable = itemType === "ingredient" ? ingredientsDB : suppliesDB;
      const itemColumn =
        itemType === "ingredient" ? supplierItemsDB.ingredientId : supplierItemsDB.supplyId;
      const filters: SQL[] = [eq(supplierItemsDB.supplierId, supplierId), isNotNull(itemColumn)];
      if (status === "active") filters.push(isNull(supplierItemsDB.deletedAt));
      if (status === "inactive") filters.push(isNotNull(supplierItemsDB.deletedAt));
      if (search?.trim()) filters.push(ilike(itemTable.name, `%${search.trim()}%`));
      const result = await paginate({
        executor: fastify.db,
        createQuery: () =>
          fastify.db
            .select({ id: supplierItemsDB.id })
            .from(supplierItemsDB)
            .innerJoin(itemTable, eq(itemColumn, itemTable.id))
            .where(and(...filters))
            .$dynamic(),
        orderBy: [asc(itemTable.name), asc(supplierItemsDB.id)],
        page,
        pageSize: pageSize ?? 20,
      });
      const data = await Promise.all(
        result.data.map(async ({ id }) => mapItem(await getSupplierItem(supplierId, id, true))),
      );
      return { ...result, data };
    },

    async assignItem(supplierId, input, actorUserId) {
      await assertActiveSupplier(supplierId);
      const normalized = normalizePresentation(input.presentation);
      await validateQuantity(input.itemType, input.itemId, normalized.contentQuantity);
      const itemColumn =
        input.itemType === "ingredient" ? supplierItemsDB.ingredientId : supplierItemsDB.supplyId;
      let createdId = "";
      try {
        await fastify.db.transaction(async (tx) => {
          const [supplier] = await tx
            .select({ id: suppliersDB.id, deletedAt: suppliersDB.deletedAt })
            .from(suppliersDB)
            .where(eq(suppliersDB.id, supplierId))
            .limit(1)
            .for("update");
          if (!supplier) throw notFound("supplier.notFound", "The supplier was not found");
          if (supplier.deletedAt) {
            throw conflict(
              "supplier.inactive",
              "Restore the supplier before changing its catalog",
            );
          }
          const [existing] = await tx
            .select({ id: supplierItemsDB.id, deletedAt: supplierItemsDB.deletedAt })
            .from(supplierItemsDB)
            .where(and(eq(supplierItemsDB.supplierId, supplierId), eq(itemColumn, input.itemId)))
            .limit(1)
            .for("update");
          if (existing) {
            throw conflict(
              existing.deletedAt ? "supplier.itemInactive" : "supplier.itemAlreadyAssigned",
              existing.deletedAt
                ? "This item was previously assigned; restore it instead"
                : "This item is already assigned to the supplier",
            );
          }
          createdId = generateNanoId();
          const presentationId = generateNanoId();
          await tx.insert(supplierItemsDB).values({
            id: createdId,
            supplierId,
            ingredientId: input.itemType === "ingredient" ? input.itemId : null,
            supplyId: input.itemType === "supply" ? input.itemId : null,
          });
          await tx.insert(supplierItemPresentationsDB).values({
            id: presentationId,
            supplierItemId: createdId,
            name: normalized.name,
            contentQuantity: normalized.contentQuantity,
            isDefault: true,
          });
          await tx.insert(supplierPresentationCostsDB).values({
            id: generateNanoId(),
            presentationId,
            priceCents: normalized.priceCents,
            createdByUserId: actorUserId,
            note: normalized.note,
          });
        });
      } catch (error) {
        const pgError = getPgError(error);
        if (pgError?.code === "23505")
          throw conflict(
            "supplier.itemAlreadyAssigned",
            "This item or presentation is already assigned",
          );
        throw error;
      }
      return mapItem(await getSupplierItem(supplierId, createdId));
    },

    async deactivateItem(supplierId, supplierItemId) {
      await assertActiveSupplier(supplierId);
      const item = await getSupplierItem(supplierId, supplierItemId, true);
      if (item.deletedAt) return;
      await fastify.db
        .update(supplierItemsDB)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(supplierItemsDB.id, supplierItemId));
    },

    async restoreItem(supplierId, supplierItemId) {
      await assertActiveSupplier(supplierId);
      const item = await getSupplierItem(supplierId, supplierItemId, true);
      if (!item.deletedAt) return mapItem(item);
      const presentations = await listPresentations(supplierItemId);
      const active = presentations.filter((presentation) => presentation.status === "active");
      if (!active.length || !active.some((presentation) => presentation.isDefault)) {
        throw conflict(
          "supplier.itemMissingDefaultPresentation",
          "The item needs an active default presentation before it can be restored",
        );
      }
      try {
        await fastify.db
          .update(supplierItemsDB)
          .set({ deletedAt: null, updatedAt: new Date() })
          .where(eq(supplierItemsDB.id, supplierItemId));
      } catch (error) {
        const pgError = getPgError(error);
        if (pgError?.code === "23505")
          throw conflict(
            "supplier.itemAlreadyAssigned",
            "This item is already assigned to the supplier",
          );
        throw error;
      }
      return mapItem(await getSupplierItem(supplierId, supplierItemId));
    },

    async createPresentation(supplierId, supplierItemId, input, actorUserId) {
      await assertActiveSupplier(supplierId);
      const item = await getSupplierItem(supplierId, supplierItemId);
      const normalized = normalizePresentation(input);
      await validateQuantity(
        item.ingredientId ? "ingredient" : "supply",
        item.itemId,
        normalized.contentQuantity,
      );
      let presentationId = "";
      try {
        await fastify.db.transaction(async (tx) => {
          const [supplier] = await tx
            .select({ id: suppliersDB.id, deletedAt: suppliersDB.deletedAt })
            .from(suppliersDB)
            .where(eq(suppliersDB.id, supplierId))
            .limit(1)
            .for("update");
          if (!supplier || supplier.deletedAt) {
            throw conflict(
              "supplier.inactive",
              "Restore the supplier before changing its catalog",
            );
          }
          const activeRows = await tx
            .select({ id: supplierItemPresentationsDB.id })
            .from(supplierItemPresentationsDB)
            .where(
              and(
                eq(supplierItemPresentationsDB.supplierItemId, supplierItemId),
                isNull(supplierItemPresentationsDB.deletedAt),
              ),
            )
            .for("update");
          const shouldDefault = activeRows.length === 0 || normalized.isDefault;
          if (shouldDefault && activeRows.length) {
            await tx
              .update(supplierItemPresentationsDB)
              .set({ isDefault: false, updatedAt: new Date() })
              .where(
                and(
                  eq(supplierItemPresentationsDB.supplierItemId, supplierItemId),
                  isNull(supplierItemPresentationsDB.deletedAt),
                ),
              );
          }
          presentationId = generateNanoId();
          await tx.insert(supplierItemPresentationsDB).values({
            id: presentationId,
            supplierItemId,
            name: normalized.name,
            contentQuantity: normalized.contentQuantity,
            isDefault: shouldDefault,
          });
          await tx.insert(supplierPresentationCostsDB).values({
            id: generateNanoId(),
            presentationId,
            priceCents: normalized.priceCents,
            createdByUserId: actorUserId,
            note: normalized.note,
          });
        });
      } catch (error) {
        const pgError = getPgError(error);
        if (pgError?.code === "23505")
          throw conflict(
            "supplier.presentationDuplicated",
            "A presentation with this name already exists",
          );
        throw error;
      }
      return (await listPresentations(supplierItemId)).find(
        (row) => row.id === presentationId,
      ) as SupplierPresentationResponse;
    },

    async deactivatePresentation(supplierId, supplierItemId, presentationId) {
      await assertActiveSupplier(supplierId);
      await fastify.db.transaction(async (tx) => {
        const [item] = await tx
          .select({ id: supplierItemsDB.id, deletedAt: supplierItemsDB.deletedAt })
          .from(supplierItemsDB)
          .where(
            and(
              eq(supplierItemsDB.id, supplierItemId),
              eq(supplierItemsDB.supplierId, supplierId),
            ),
          )
          .limit(1)
          .for("update");
        if (!item || item.deletedAt) {
          throw notFound("supplier.itemNotFound", "The supplier item was not found");
        }
        const presentations = await tx
          .select({
            id: supplierItemPresentationsDB.id,
            isDefault: supplierItemPresentationsDB.isDefault,
            deletedAt: supplierItemPresentationsDB.deletedAt,
          })
          .from(supplierItemPresentationsDB)
          .where(eq(supplierItemPresentationsDB.supplierItemId, supplierItemId))
          .for("update");
        const presentation = presentations.find((row) => row.id === presentationId);
        if (!presentation) {
          throw notFound(
            "supplier.presentationNotFound",
            "The supplier presentation was not found",
          );
        }
        if (presentation.deletedAt) return;
        if (presentation.isDefault) {
          throw conflict(
            "supplier.defaultPresentation",
            "Choose another default presentation before deactivating this one",
          );
        }
        if (presentations.filter((row) => !row.deletedAt).length <= 1) {
          throw conflict(
            "supplier.lastPresentation",
            "The only active presentation cannot be deactivated",
          );
        }
        await tx
          .update(supplierItemPresentationsDB)
          .set({ deletedAt: new Date(), isDefault: false, updatedAt: new Date() })
          .where(eq(supplierItemPresentationsDB.id, presentationId));
      });
    },

    async restorePresentation(supplierId, supplierItemId, presentationId) {
      await assertActiveSupplier(supplierId);
      await getSupplierItem(supplierId, supplierItemId);
      const presentation = await getPresentation(supplierId, supplierItemId, presentationId, true);
      if (!presentation.deletedAt)
        return (await listPresentations(supplierItemId)).find(
          (row) => row.id === presentationId,
        ) as SupplierPresentationResponse;
      try {
        await fastify.db
          .update(supplierItemPresentationsDB)
          .set({ deletedAt: null, isDefault: false, updatedAt: new Date() })
          .where(eq(supplierItemPresentationsDB.id, presentationId));
      } catch (error) {
        const pgError = getPgError(error);
        if (pgError?.code === "23505")
          throw conflict(
            "supplier.presentationDuplicated",
            "An active presentation with this name already exists",
          );
        throw error;
      }
      return (await listPresentations(supplierItemId)).find(
        (row) => row.id === presentationId,
      ) as SupplierPresentationResponse;
    },

    async setDefaultPresentation(supplierId, supplierItemId, presentationId) {
      await assertActiveSupplier(supplierId);
      await getSupplierItem(supplierId, supplierItemId);
      await getPresentation(supplierId, supplierItemId, presentationId);
      await fastify.db.transaction(async (tx) => {
        await tx
          .select({ id: supplierItemPresentationsDB.id })
          .from(supplierItemPresentationsDB)
          .where(
            and(
              eq(supplierItemPresentationsDB.supplierItemId, supplierItemId),
              isNull(supplierItemPresentationsDB.deletedAt),
            ),
          )
          .for("update");
        await tx
          .update(supplierItemPresentationsDB)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(
            and(
              eq(supplierItemPresentationsDB.supplierItemId, supplierItemId),
              isNull(supplierItemPresentationsDB.deletedAt),
            ),
          );
        await tx
          .update(supplierItemPresentationsDB)
          .set({ isDefault: true, updatedAt: new Date() })
          .where(eq(supplierItemPresentationsDB.id, presentationId));
      });
      return (await listPresentations(supplierItemId)).find(
        (row) => row.id === presentationId,
      ) as SupplierPresentationResponse;
    },

    async addCost(supplierId, supplierItemId, presentationId, input, actorUserId) {
      await assertActiveSupplier(supplierId);
      await getSupplierItem(supplierId, supplierItemId);
      const presentation = await getPresentation(supplierId, supplierItemId, presentationId);
      const now = new Date();
      let costId = "";
      await fastify.db.transaction(async (tx) => {
        const [supplier] = await tx
          .select({ id: suppliersDB.id, deletedAt: suppliersDB.deletedAt })
          .from(suppliersDB)
          .where(eq(suppliersDB.id, supplierId))
          .limit(1)
          .for("update");
        if (!supplier || supplier.deletedAt) {
          throw conflict(
            "supplier.inactive",
            "Restore the supplier before changing its catalog",
          );
        }
        const current = await tx
          .select({ id: supplierPresentationCostsDB.id })
          .from(supplierPresentationCostsDB)
          .where(
            and(
              eq(supplierPresentationCostsDB.presentationId, presentationId),
              isNull(supplierPresentationCostsDB.effectiveTo),
            ),
          )
          .for("update");
        if (current.length) {
          await tx
            .update(supplierPresentationCostsDB)
            .set({ effectiveTo: now })
            .where(
              and(
                eq(supplierPresentationCostsDB.presentationId, presentationId),
                isNull(supplierPresentationCostsDB.effectiveTo),
              ),
            );
        }
        costId = generateNanoId();
        await tx.insert(supplierPresentationCostsDB).values({
          id: costId,
          presentationId,
          priceCents: input.priceCents,
          effectiveFrom: now,
          createdByUserId: actorUserId,
          note: input.note
            ? normalizeString(input.note, { trim: true, collapseWhitespace: true }) || null
            : null,
        });
      });
      const result = await service.listCosts(supplierId, supplierItemId, presentationId, {
        page: 1,
        pageSize: 100,
      });
      const cost = result.data.find((row) => row.id === costId);
      if (!cost) throw new Error("Failed to retrieve supplier cost");
      return {
        ...cost,
        unitCostPerBaseUnit: unitCost(input.priceCents, Number(presentation.contentQuantity)),
      };
    },

    async listCosts(supplierId, supplierItemId, presentationId, { page, pageSize } = {}) {
      const presentation = await getPresentation(supplierId, supplierItemId, presentationId, true);
      return paginate({
        executor: fastify.db,
        createQuery: () =>
          fastify.db
            .select({
              id: supplierPresentationCostsDB.id,
              priceCents: supplierPresentationCostsDB.priceCents,
              effectiveFrom: supplierPresentationCostsDB.effectiveFrom,
              effectiveTo: supplierPresentationCostsDB.effectiveTo,
              note: supplierPresentationCostsDB.note,
              userId: userDB.id,
              userName: userDB.name,
              userEmail: userDB.email,
            })
            .from(supplierPresentationCostsDB)
            .leftJoin(userDB, eq(supplierPresentationCostsDB.createdByUserId, userDB.id))
            .where(eq(supplierPresentationCostsDB.presentationId, presentationId))
            .$dynamic(),
        orderBy: [
          desc(supplierPresentationCostsDB.effectiveFrom),
          desc(supplierPresentationCostsDB.id),
        ],
        page,
        pageSize: pageSize ?? 20,
        mapRow: (row): SupplierCostResponse => ({
          id: row.id,
          priceCents: row.priceCents,
          unitCostPerBaseUnit: unitCost(row.priceCents, Number(presentation.contentQuantity)),
          effectiveFrom: row.effectiveFrom,
          effectiveTo: row.effectiveTo,
          note: row.note,
          createdBy:
            row.userId && row.userName && row.userEmail
              ? { id: row.userId, name: row.userName, email: row.userEmail }
              : null,
        }),
      });
    },
  };

  return service;
}
