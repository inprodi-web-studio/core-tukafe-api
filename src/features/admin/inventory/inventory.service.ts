import {
  ingredientsDB,
  inventoryAdjustmentLinesDB,
  inventoryAdjustmentsDB,
  inventoryAvailabilityOverridesDB,
  inventoryBalancesDB,
  inventoryItemsDB,
  inventoryLocationAccessDB,
  inventoryLocationItemsDB,
  inventoryLocationsDB,
  inventoryLotsDB,
  inventoryMovementLinesDB,
  inventoryMovementsDB,
  inventoryReservationsDB,
  productsDB,
  suppliesDB,
  userDB,
  workOrdersDB,
  type InventoryItem,
  type InventoryLocation,
} from "@core/db/schemas";
import {
  conflict,
  forbidden,
  generateNanoId,
  normalizeString,
  notFound,
  validation,
} from "@core/utils";
import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type {
  AdminInventoryService,
  CreateInventoryAdjustmentInput,
  InventoryActorContext,
  InventoryAdjustmentResponse,
  InventoryItemResponse,
  InventoryLocationResponse,
  InventoryStockResponse,
  InventoryAvailabilityOverrideResponse,
} from "./inventory.types";

type TransactionDb = Parameters<Parameters<FastifyInstance["db"]["transaction"]>[0]>[0];
type InventoryDb = FastifyInstance["db"] | TransactionDb;

interface RawInventoryItemRow {
  id: string;
  kind: InventoryItem["kind"];
  sourceId: string;
  name: string;
  isTracked: boolean;
  tracksLots: boolean;
  isPerishable: boolean;
  expirationWarningDays: number;
  unitId: string;
  unitName: string;
  unitAbbreviation: string;
  unitPrecision: number;
}

const EPSILON = 0.0000001;

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function localDate(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function assertValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("es-MX", { timeZone: timezone }).format();
  } catch {
    throw validation("inventory.invalidTimezone", "Timezone is not a valid IANA timezone");
  }
}

function mapLocation(location: InventoryLocation): InventoryLocationResponse {
  return {
    id: location.id,
    name: location.name,
    type: location.type,
    organizationId: location.organizationId,
    timezone: location.timezone,
    isDefaultSalesLocation: location.isDefaultSalesLocation,
    salesEnforcementEnabled: location.salesEnforcementEnabled,
  };
}

function mapInventoryItem(row: RawInventoryItemRow): InventoryItemResponse {
  return {
    id: row.id,
    kind: row.kind,
    sourceId: row.sourceId,
    name: row.name,
    isTracked: row.isTracked,
    tracksLots: row.tracksLots,
    isPerishable: row.isPerishable,
    expirationWarningDays: Number(row.expirationWarningDays),
    unit: {
      id: row.unitId,
      name: row.unitName,
      abbreviation: row.unitAbbreviation,
      precision: Number(row.unitPrecision),
    },
  };
}

async function ensureInventoryCatalog(db: InventoryDb) {
  await db.execute(sql`
    insert into inventory_item (
      id, kind, ingredient_id, base_unit_id, is_tracked, tracks_lots,
      is_perishable, expiration_warning_days
    )
    select
      'inv_ing_' || i.id, 'ingredient', i.id, i.base_unit_id,
      i.is_inventory_tracked, i.tracks_lots, i.is_perishable, i.expiration_warning_days
    from ingredient i
    on conflict (ingredient_id) where ingredient_id is not null do update set
      base_unit_id = excluded.base_unit_id,
      is_tracked = excluded.is_tracked,
      tracks_lots = excluded.tracks_lots,
      is_perishable = excluded.is_perishable,
      expiration_warning_days = excluded.expiration_warning_days,
      updated_at = now()
  `);
  await db.execute(sql`
    insert into inventory_item (
      id, kind, supply_id, base_unit_id, is_tracked, tracks_lots,
      is_perishable, expiration_warning_days
    )
    select
      'inv_sup_' || s.id, 'supply', s.id, s.base_unit_id,
      s.is_inventory_tracked, s.tracks_lots, s.is_perishable, s.expiration_warning_days
    from supply s
    on conflict (supply_id) where supply_id is not null do update set
      base_unit_id = excluded.base_unit_id,
      is_tracked = excluded.is_tracked,
      tracks_lots = excluded.tracks_lots,
      is_perishable = excluded.is_perishable,
      expiration_warning_days = excluded.expiration_warning_days,
      updated_at = now()
  `);
  await db.execute(sql`
    insert into inventory_item (id, kind, product_id, base_unit_id, is_tracked)
    select
      'inv_prd_' || p.id, 'product', p.id, p.unit_id,
      p.inventory_tracking_mode = 'finished_good'
        and not exists (select 1 from variation v where v.product_id = p.id and v.deleted_at is null)
    from product p
    on conflict (product_id) where product_id is not null do update set
      base_unit_id = excluded.base_unit_id,
      is_tracked = excluded.is_tracked,
      updated_at = now()
  `);
  await db.execute(sql`
    insert into inventory_item (id, kind, variation_id, base_unit_id, is_tracked)
    select
      'inv_var_' || v.id, 'variation', v.id, p.unit_id,
      p.inventory_tracking_mode = 'finished_good'
    from variation v
    inner join product p on p.id = v.product_id
    on conflict (variation_id) where variation_id is not null do update set
      base_unit_id = excluded.base_unit_id,
      is_tracked = excluded.is_tracked,
      updated_at = now()
  `);
}

async function ensureBranchLocations(db: InventoryDb) {
  await db.execute(sql`
    insert into inventory_location (
      id, name, type, organization_id, timezone, is_default_sales_location
    )
    select 'inv_loc_' || o.id, o.name, 'branch', o.id, o.timezone, true
    from organization o
    where o.deleted_at is null
      and not exists (
        select 1 from inventory_location l
        where l.organization_id = o.id
          and l.type = 'branch'
          and l.is_default_sales_location = true
          and l.deleted_at is null
      )
  `);
}

async function isGlobalOwner(db: InventoryDb, userId: string) {
  const [user] = await db
    .select({ role: userDB.role })
    .from(userDB)
    .where(eq(userDB.id, userId))
    .limit(1);

  return user?.role === "owner";
}

async function assertLocationAccess(
  db: InventoryDb,
  context: InventoryActorContext & { locationId: string },
) {
  const [location] = await db
    .select()
    .from(inventoryLocationsDB)
    .where(
      and(eq(inventoryLocationsDB.id, context.locationId), isNull(inventoryLocationsDB.deletedAt)),
    )
    .limit(1);

  if (!location) {
    throw notFound("inventory.locationNotFound", "Inventory location was not found");
  }

  if (await isGlobalOwner(db, context.userId)) {
    return location;
  }

  if (location.type === "branch" && location.organizationId === context.organizationId) {
    return location;
  }

  const [access] = await db
    .select({ locationId: inventoryLocationAccessDB.locationId })
    .from(inventoryLocationAccessDB)
    .where(
      and(
        eq(inventoryLocationAccessDB.locationId, location.id),
        eq(inventoryLocationAccessDB.userId, context.userId),
      ),
    )
    .limit(1);

  if (!access) {
    throw forbidden("inventory.locationAccessDenied", "You cannot access this inventory location");
  }

  return location;
}

async function listInventoryItemRows(db: InventoryDb): Promise<RawInventoryItemRow[]> {
  const result = await db.execute(sql`
    select
      ii.id,
      ii.kind,
      coalesce(ii.ingredient_id, ii.supply_id, ii.product_id, ii.variation_id) as "sourceId",
      coalesce(i.name, s.name, p.name, vp.name || ' · ' || v.combination_key) as name,
      ii.is_tracked as "isTracked",
      ii.tracks_lots as "tracksLots",
      ii.is_perishable as "isPerishable",
      ii.expiration_warning_days as "expirationWarningDays",
      u.id as "unitId",
      u.name as "unitName",
      u.abbreviation as "unitAbbreviation",
      u.precision as "unitPrecision"
    from inventory_item ii
    inner join unit u on u.id = ii.base_unit_id
    left join ingredient i on i.id = ii.ingredient_id and i.deleted_at is null
    left join supply s on s.id = ii.supply_id and s.deleted_at is null
    left join product p on p.id = ii.product_id and p.deleted_at is null
    left join variation v on v.id = ii.variation_id and v.deleted_at is null
    left join product vp on vp.id = v.product_id and vp.deleted_at is null
    where i.id is not null or s.id is not null or p.id is not null or v.id is not null
    order by name asc, ii.id asc
  `);

  return result.rows as unknown as RawInventoryItemRow[];
}

async function getInventoryItemRow(db: InventoryDb, inventoryItemId: string) {
  const rows = await listInventoryItemRows(db);
  const row = rows.find((item) => item.id === inventoryItemId);

  if (!row) {
    throw notFound("inventory.itemNotFound", "Inventory item was not found");
  }

  return row;
}

async function ensureLocationItem(db: TransactionDb, locationId: string, inventoryItemId: string) {
  await db
    .insert(inventoryLocationItemsDB)
    .values({ locationId, inventoryItemId })
    .onConflictDoNothing();
}

async function resolveEntryLot(
  tx: TransactionDb,
  input: {
    item: RawInventoryItemRow;
    location: InventoryLocation;
    lotCode?: string | null;
    expiresOn?: string | null;
  },
) {
  const normalizedLotCode = input.lotCode
    ? normalizeString(input.lotCode, { trim: true, collapseWhitespace: true }).toLocaleLowerCase(
        "es-MX",
      )
    : null;
  const lotCode = input.lotCode
    ? normalizeString(input.lotCode, { trim: true, collapseWhitespace: true })
    : null;
  const expiresOn = input.expiresOn ?? null;

  if (input.item.tracksLots && !lotCode) {
    throw validation("inventory.lotCodeRequired", "Lot code is required for this item", {
      inventoryItemId: input.item.id,
    });
  }
  if (input.item.isPerishable && !expiresOn) {
    throw validation(
      "inventory.expirationRequired",
      "Expiration date is required for this perishable item",
      { inventoryItemId: input.item.id },
    );
  }
  if (expiresOn && expiresOn < localDate(input.location.timezone)) {
    throw validation("inventory.expirationInPast", "Expiration date cannot be in the past", {
      inventoryItemId: input.item.id,
      expiresOn,
    });
  }

  if (normalizedLotCode) {
    const [existing] = await tx
      .select()
      .from(inventoryLotsDB)
      .where(
        and(
          eq(inventoryLotsDB.inventoryItemId, input.item.id),
          eq(inventoryLotsDB.normalizedLotCode, normalizedLotCode),
        ),
      )
      .limit(1);

    if (existing) {
      if (existing.expiresOn !== expiresOn) {
        throw conflict(
          "inventory.lotExpirationMismatch",
          "The lot code already exists with another expiration date",
          { lotId: existing.id, expiresOn: existing.expiresOn },
        );
      }
      return existing;
    }
  } else if (!input.item.isPerishable) {
    const [defaultLot] = await tx
      .select()
      .from(inventoryLotsDB)
      .where(
        and(
          eq(inventoryLotsDB.inventoryItemId, input.item.id),
          eq(inventoryLotsDB.internalBatchKey, "default"),
        ),
      )
      .limit(1);

    if (defaultLot) {
      return defaultLot;
    }
  }

  const [createdLot] = await tx
    .insert(inventoryLotsDB)
    .values({
      id: generateNanoId(),
      inventoryItemId: input.item.id,
      lotCode,
      normalizedLotCode,
      internalBatchKey: normalizedLotCode ? `lot:${normalizedLotCode}` : generateNanoId(),
      expiresOn,
    })
    .returning();

  if (!createdLot) {
    throw new Error("Failed to create inventory lot");
  }

  return createdLot;
}

async function resolveExitLot(
  tx: TransactionDb,
  input: { item: RawInventoryItemRow; lotId?: string | null },
) {
  if (!input.lotId && (input.item.tracksLots || input.item.isPerishable)) {
    throw validation(
      "inventory.lotSelectionRequired",
      "A lot must be selected for this inventory exit",
      { inventoryItemId: input.item.id },
    );
  }

  const [lot] = await tx
    .select()
    .from(inventoryLotsDB)
    .where(
      and(
        eq(inventoryLotsDB.inventoryItemId, input.item.id),
        input.lotId
          ? eq(inventoryLotsDB.id, input.lotId)
          : eq(inventoryLotsDB.internalBatchKey, "default"),
      ),
    )
    .limit(1);

  if (!lot) {
    throw notFound("inventory.lotNotFound", "Inventory lot was not found", {
      inventoryItemId: input.item.id,
    });
  }

  return lot;
}

async function lockBalance(
  tx: TransactionDb,
  locationId: string,
  inventoryItemId: string,
  lotId: string,
) {
  await tx
    .insert(inventoryBalancesDB)
    .values({ locationId, inventoryItemId, lotId })
    .onConflictDoNothing();
  const result = await tx.execute(sql`
    select
      on_hand_quantity as "onHandQuantity",
      reserved_quantity as "reservedQuantity"
    from inventory_balance
    where location_id = ${locationId}
      and inventory_item_id = ${inventoryItemId}
      and lot_id = ${lotId}
    for update
  `);
  const row = result.rows[0] as
    | { onHandQuantity: string | number; reservedQuantity: string | number }
    | undefined;

  if (!row) {
    throw new Error("Failed to lock inventory balance");
  }

  return {
    onHandQuantity: Number(row.onHandQuantity),
    reservedQuantity: Number(row.reservedQuantity),
  };
}

async function applyBalanceDelta(
  tx: TransactionDb,
  input: {
    locationId: string;
    inventoryItemId: string;
    lotId: string;
    onHandDelta: number;
    reservedDelta?: number;
  },
) {
  const balance = await lockBalance(
    tx,
    input.locationId,
    input.inventoryItemId,
    input.lotId,
  );
  const onHandAfter = roundQuantity(balance.onHandQuantity + input.onHandDelta);
  const reservedAfter = roundQuantity(balance.reservedQuantity + (input.reservedDelta ?? 0));

  if (onHandAfter < -EPSILON) {
    throw conflict("inventory.insufficientPhysicalStock", "Physical inventory is insufficient", {
      inventoryItemId: input.inventoryItemId,
      lotId: input.lotId,
      onHandQuantity: balance.onHandQuantity,
      requestedQuantity: Math.abs(input.onHandDelta),
    });
  }
  if (reservedAfter < -EPSILON) {
    throw new Error("Inventory reserved quantity cannot become negative");
  }

  await tx
    .update(inventoryBalancesDB)
    .set({
      onHandQuantity: Math.max(0, onHandAfter),
      reservedQuantity: Math.max(0, reservedAfter),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(inventoryBalancesDB.locationId, input.locationId),
        eq(inventoryBalancesDB.inventoryItemId, input.inventoryItemId),
        eq(inventoryBalancesDB.lotId, input.lotId),
      ),
    );

  return {
    onHandAfter: Math.max(0, onHandAfter),
    reservedAfter: Math.max(0, reservedAfter),
  };
}

async function getAdjustment(
  db: InventoryDb,
  adjustmentId: string,
): Promise<InventoryAdjustmentResponse> {
  const headerResult = await db.execute(sql`
    select
      a.id,
      a.location_id as "locationId",
      a.direction,
      a.reason,
      a.observations,
      a.reversed_at as "reversedAt",
      a.reversal_adjustment_id as "reversalAdjustmentId",
      a.created_at as "createdAt",
      u.id as "createdById",
      concat_ws(' ', u.name, u.middle_name, u.last_name) as "createdByName"
    from inventory_adjustment a
    inner join "user" u on u.id = a.created_by_user_id
    where a.id = ${adjustmentId}
    limit 1
  `);
  const header = headerResult.rows[0] as
    | Omit<InventoryAdjustmentResponse, "lines" | "createdBy"> & {
        createdById: string;
        createdByName: string;
      }
    | undefined;

  if (!header) {
    throw notFound("inventory.adjustmentNotFound", "Inventory adjustment was not found");
  }

  const linesResult = await db.execute(sql`
    select
      al.id,
      al.inventory_item_id as "inventoryItemId",
      coalesce(i.name, s.name, p.name, vp.name || ' · ' || v.combination_key) as "itemName",
      al.lot_id as "lotId",
      l.lot_code as "lotCode",
      l.expires_on as "expiresOn",
      al.quantity
    from inventory_adjustment_line al
    inner join inventory_item ii on ii.id = al.inventory_item_id
    inner join inventory_lot l on l.id = al.lot_id
    left join ingredient i on i.id = ii.ingredient_id
    left join supply s on s.id = ii.supply_id
    left join product p on p.id = ii.product_id
    left join variation v on v.id = ii.variation_id
    left join product vp on vp.id = v.product_id
    where al.adjustment_id = ${adjustmentId}
    order by al.created_at asc, al.id asc
  `);

  return {
    id: header.id,
    locationId: header.locationId,
    direction: header.direction,
    reason: header.reason,
    observations: header.observations,
    reversedAt: header.reversedAt ? new Date(header.reversedAt) : null,
    reversalAdjustmentId: header.reversalAdjustmentId,
    createdAt: new Date(header.createdAt),
    createdBy: { id: header.createdById, name: header.createdByName },
    lines: (
      linesResult.rows as Array<InventoryAdjustmentResponse["lines"][number] & { quantity: string }>
    ).map((line) => ({ ...line, quantity: Number(line.quantity) })),
  };
}

export function adminInventoryService(fastify: FastifyInstance): AdminInventoryService {
  return {
    async listLocations(context) {
      await ensureBranchLocations(fastify.db);
      const owner = await isGlobalOwner(fastify.db, context.userId);
      const locations = await fastify.db
        .select()
        .from(inventoryLocationsDB)
        .leftJoin(
          inventoryLocationAccessDB,
          and(
            eq(inventoryLocationAccessDB.locationId, inventoryLocationsDB.id),
            eq(inventoryLocationAccessDB.userId, context.userId),
          ),
        )
        .where(
          and(
            isNull(inventoryLocationsDB.deletedAt),
            owner
              ? undefined
              : or(
                  eq(inventoryLocationsDB.organizationId, context.organizationId),
                  eq(inventoryLocationAccessDB.userId, context.userId),
                ),
          ),
        )
        .orderBy(inventoryLocationsDB.type, inventoryLocationsDB.name);

      return locations.map(({ inventory_location: location }) => mapLocation(location));
    },

    async createDistributionCenter(input) {
      if (!(await isGlobalOwner(fastify.db, input.userId))) {
        throw forbidden(
          "inventory.globalOwnerRequired",
          "Only a global owner can create distribution centers",
        );
      }
      assertValidTimezone(input.timezone);
      const [created] = await fastify.db
        .insert(inventoryLocationsDB)
        .values({
          id: generateNanoId(),
          name: normalizeString(input.name, { trim: true, collapseWhitespace: true }),
          type: "distribution_center",
          timezone: input.timezone,
        })
        .returning();

      if (!created) {
        throw new Error("Failed to create distribution center");
      }
      return mapLocation(created);
    },

    async listItems() {
      await ensureInventoryCatalog(fastify.db);
      return (await listInventoryItemRows(fastify.db)).map(mapInventoryItem);
    },

    async getProductConfiguration(input) {
      await ensureInventoryCatalog(fastify.db);
      const [product] = await fastify.db
        .select({
          id: productsDB.id,
          productType: productsDB.productType,
          trackingMode: productsDB.inventoryTrackingMode,
        })
        .from(productsDB)
        .where(and(eq(productsDB.id, input.productId), isNull(productsDB.deletedAt)))
        .limit(1);
      if (!product) {
        throw notFound("product.notFound", "Product was not found");
      }
      const itemRows = (await listInventoryItemRows(fastify.db)).filter(
        (item) =>
          (item.kind === "product" && item.sourceId === product.id) ||
          item.kind === "variation",
      );
      const variationResult = await fastify.db.execute(sql`
        select id from variation
        where product_id = ${product.id} and deleted_at is null
      `);
      const variationIds = new Set(
        (variationResult.rows as Array<{ id: string }>).map((variation) => variation.id),
      );
      const productItem = itemRows.find(
        (item) => item.kind === "product" && item.sourceId === product.id,
      );
      return {
        productId: product.id,
        productType: product.productType,
        trackingMode: product.trackingMode,
        item: productItem ? mapInventoryItem(productItem) : null,
        variations: itemRows
          .filter((item) => item.kind === "variation" && variationIds.has(item.sourceId))
          .map(mapInventoryItem),
      };
    },

    async updateProductConfiguration(input) {
      const current = await this.getProductConfiguration(input);
      const allowedModes = {
        simple: new Set(["untracked", "finished_good"]),
        assembled: new Set(["untracked", "recipe", "finished_good"]),
        compound: new Set(["derived"]),
      }[current.productType];
      if (!allowedModes.has(input.trackingMode)) {
        throw validation(
          "inventory.invalidProductTrackingMode",
          "Inventory tracking mode is incompatible with the product type",
          { productType: current.productType, trackingMode: input.trackingMode },
        );
      }
      const existingItems = [current.item, ...current.variations].filter(
        (item): item is InventoryItemResponse => item !== null,
      );
      const variationConfiguration = new Map(
        input.variations?.map((variation) => [variation.variationId, variation]) ?? [],
      );
      const configurationChanged =
        current.trackingMode !== input.trackingMode ||
        existingItems.some((item) => {
          const configuration = variationConfiguration.get(item.sourceId) ?? input;
          return (
            item.tracksLots !== configuration.tracksLots ||
            item.isPerishable !== configuration.isPerishable
          );
        });

      if (configurationChanged && existingItems.length > 0) {
        const [balance] = await fastify.db
          .select({ count: sql<number>`count(*)::int` })
          .from(inventoryBalancesDB)
          .where(
            and(
              inArray(
                inventoryBalancesDB.inventoryItemId,
                existingItems.map((item) => item.id),
              ),
              or(
                ne(inventoryBalancesDB.onHandQuantity, 0),
                ne(inventoryBalancesDB.reservedQuantity, 0),
              ),
            ),
          );
        if (Number(balance?.count ?? 0) > 0) {
          throw conflict(
            "inventory.productConfigurationHasStock",
            "Product inventory configuration can only change with zero balances",
          );
        }
      }

      await fastify.db.transaction(async (tx) => {
        await tx
          .update(productsDB)
          .set({ inventoryTrackingMode: input.trackingMode, updatedAt: new Date() })
          .where(eq(productsDB.id, input.productId));
        await ensureInventoryCatalog(tx);
        const targetItems = await listInventoryItemRows(tx);
        const productVariationIds = new Set(current.variations.map((variation) => variation.sourceId));
        const rows = targetItems.filter(
          (item) =>
            (item.kind === "product" && item.sourceId === input.productId) ||
            (item.kind === "variation" && productVariationIds.has(item.sourceId)),
        );
        for (const item of rows) {
          const configuration = variationConfiguration.get(item.sourceId) ?? input;
          await tx
            .update(inventoryItemsDB)
            .set({
              tracksLots: configuration.tracksLots,
              isPerishable: configuration.isPerishable,
              expirationWarningDays: configuration.expirationWarningDays,
              updatedAt: new Date(),
            })
            .where(eq(inventoryItemsDB.id, item.id));
        }
      });

      return this.getProductConfiguration(input);
    },

    async updateItemConfiguration(input) {
      await ensureInventoryCatalog(fastify.db);
      const current = await getInventoryItemRow(fastify.db, input.inventoryItemId);
      const changesLotBehavior =
        (input.isTracked !== undefined && input.isTracked !== current.isTracked) ||
        (input.tracksLots !== undefined && input.tracksLots !== current.tracksLots) ||
        (input.isPerishable !== undefined && input.isPerishable !== current.isPerishable);

      if (changesLotBehavior) {
        const [balance] = await fastify.db
          .select({ count: sql<number>`count(*)::int` })
          .from(inventoryBalancesDB)
          .where(
            and(
              eq(inventoryBalancesDB.inventoryItemId, current.id),
              or(
                ne(inventoryBalancesDB.onHandQuantity, 0),
                ne(inventoryBalancesDB.reservedQuantity, 0),
              ),
            ),
          );
        if (Number(balance?.count ?? 0) > 0) {
          throw conflict(
            "inventory.itemConfigurationHasStock",
            "Inventory tracking and lot configuration can only change with zero balances",
          );
        }
      }

      await fastify.db.transaction(async (tx) => {
        await tx
          .update(inventoryItemsDB)
          .set({
            ...(input.isTracked !== undefined ? { isTracked: input.isTracked } : {}),
            ...(input.tracksLots !== undefined ? { tracksLots: input.tracksLots } : {}),
            ...(input.isPerishable !== undefined ? { isPerishable: input.isPerishable } : {}),
            ...(input.expirationWarningDays !== undefined
              ? { expirationWarningDays: input.expirationWarningDays }
              : {}),
            updatedAt: new Date(),
          })
          .where(eq(inventoryItemsDB.id, current.id));

        const catalogConfiguration = {
          ...(input.isTracked !== undefined ? { isInventoryTracked: input.isTracked } : {}),
          ...(input.tracksLots !== undefined ? { tracksLots: input.tracksLots } : {}),
          ...(input.isPerishable !== undefined ? { isPerishable: input.isPerishable } : {}),
          ...(input.expirationWarningDays !== undefined
            ? { expirationWarningDays: input.expirationWarningDays }
            : {}),
          updatedAt: new Date(),
        };
        if (current.kind === "ingredient") {
          await tx
            .update(ingredientsDB)
            .set(catalogConfiguration)
            .where(eq(ingredientsDB.id, current.sourceId));
        } else if (current.kind === "supply") {
          await tx
            .update(suppliesDB)
            .set(catalogConfiguration)
            .where(eq(suppliesDB.id, current.sourceId));
        }
      });

      return mapInventoryItem(await getInventoryItemRow(fastify.db, current.id));
    },

    async listStocks(input) {
      const location = await assertLocationAccess(fastify.db, input);
      await ensureInventoryCatalog(fastify.db);
      const currentDate = localDate(location.timezone);
      const itemRows = await listInventoryItemRows(fastify.db);
      const result = await fastify.db.execute(sql`
        select
          ii.id,
          coalesce(sum(b.on_hand_quantity), 0) as "onHandQuantity",
          coalesce(sum(b.reserved_quantity), 0) as "reservedQuantity",
          coalesce(sum(case when l.expires_on is null or l.expires_on >= ${currentDate}::date then greatest(b.on_hand_quantity - b.reserved_quantity, 0) else 0 end), 0) as "availableQuantity",
          coalesce(sum(greatest(b.reserved_quantity - b.on_hand_quantity, 0)), 0) as "deficitQuantity",
          coalesce(sum(case when l.expires_on < ${currentDate}::date then b.on_hand_quantity else 0 end), 0) as "expiredQuantity",
          count(b.lot_id)::int as "lotCount",
          li.low_stock_threshold as "lowStockThreshold"
        from inventory_item ii
        left join inventory_balance b on b.inventory_item_id = ii.id and b.location_id = ${location.id}
        left join inventory_lot l on l.id = b.lot_id
        left join inventory_location_item li on li.location_id = ${location.id} and li.inventory_item_id = ii.id
        where ii.is_tracked = true
        group by ii.id, li.low_stock_threshold
      `);
      const balances = new Map(
        (
          result.rows as Array<{
            id: string;
            onHandQuantity: string;
            reservedQuantity: string;
            availableQuantity: string;
            deficitQuantity: string;
            expiredQuantity: string;
            lotCount: number;
            lowStockThreshold: string | null;
          }>
        ).map((row) => [row.id, row]),
      );

      return itemRows
        .filter((item) => item.isTracked)
        .map((item): InventoryStockResponse => {
          const balance = balances.get(item.id);
          const availableQuantity = Number(balance?.availableQuantity ?? 0);
          const lowStockThreshold =
            balance?.lowStockThreshold == null ? null : Number(balance.lowStockThreshold);
          return {
            ...mapInventoryItem(item),
            onHandQuantity: Number(balance?.onHandQuantity ?? 0),
            reservedQuantity: Number(balance?.reservedQuantity ?? 0),
            availableQuantity,
            deficitQuantity: Number(balance?.deficitQuantity ?? 0),
            expiredQuantity: Number(balance?.expiredQuantity ?? 0),
            lowStockThreshold,
            isLowStock: lowStockThreshold !== null && availableQuantity <= lowStockThreshold,
            lotCount: Number(balance?.lotCount ?? 0),
          };
        });
    },

    async updateLocationItem(input) {
      const location = await assertLocationAccess(fastify.db, input);
      await ensureInventoryCatalog(fastify.db);
      await getInventoryItemRow(fastify.db, input.inventoryItemId);
      await fastify.db
        .insert(inventoryLocationItemsDB)
        .values({
          locationId: location.id,
          inventoryItemId: input.inventoryItemId,
          lowStockThreshold: input.lowStockThreshold,
        })
        .onConflictDoUpdate({
          target: [
            inventoryLocationItemsDB.locationId,
            inventoryLocationItemsDB.inventoryItemId,
          ],
          set: { lowStockThreshold: input.lowStockThreshold, updatedAt: new Date() },
        });
    },

    async listAvailabilityOverrides(input) {
      const location = await assertLocationAccess(fastify.db, input);
      const result = await fastify.db.execute(sql`
        select o.id, o.location_id as "locationId", o.target_type as "targetType",
          coalesce(o.product_id, o.variation_id, o.modifier_option_id) as "targetId",
          coalesce(p.name, trim(concat(vp.name, ' · ', v.customer_description)), mo.name) as "targetName",
          o.reason, o.starts_at as "startsAt", o.ends_at as "endsAt", o.created_at as "createdAt"
        from inventory_availability_override o
        left join product p on p.id = o.product_id
        left join variation v on v.id = o.variation_id
        left join product vp on vp.id = v.product_id
        left join modifier_option mo on mo.id = o.modifier_option_id
        where o.location_id = ${location.id}
          and o.cleared_at is null
          and (o.ends_at is null or o.ends_at > now())
        order by o.starts_at desc, o.id desc
      `);
      return result.rows as unknown as InventoryAvailabilityOverrideResponse[];
    },

    async listAvailabilityTargets() {
      const result = await fastify.db.execute(sql`
        select target_type as "targetType", target_id as "targetId", target_name as "targetName"
        from (
          select 'product'::text as target_type, p.id as target_id, p.name as target_name, 1 as rank
          from product p where p.deleted_at is null
          union all
          select 'variation', v.id,
            trim(concat(p.name, ' · ', coalesce(v.customer_description, v.id))), 2
          from variation v inner join product p on p.id = v.product_id
          where v.deleted_at is null and p.deleted_at is null
          union all
          select 'modifier_option', mo.id,
            trim(concat(m.name, ' · ', coalesce(mo.customer_name, mo.name))), 3
          from modifier_option mo inner join modifier m on m.id = mo.modifier_id
        ) targets
        order by rank, target_name, target_id
      `);
      return result.rows as unknown as Array<{
        targetType: "product" | "variation" | "modifier_option";
        targetId: string;
        targetName: string;
      }>;
    },

    async createAvailabilityOverride(input) {
      const location = await assertLocationAccess(fastify.db, input);
      const targetResult = await fastify.db.execute(sql`
        select name from (
          select 'product'::text as type, id, name from product where deleted_at is null
          union all
          select 'variation', v.id, trim(concat(p.name, ' · ', coalesce(v.customer_description, v.id)))
          from variation v inner join product p on p.id = v.product_id
          where v.deleted_at is null and p.deleted_at is null
          union all
          select 'modifier_option', id, name from modifier_option
        ) target
        where target.type = ${input.targetType} and target.id = ${input.targetId}
        limit 1
      `);
      if (!targetResult.rows[0]) {
        throw notFound(
          "inventory.availabilityTargetNotFound",
          "Availability override target was not found",
        );
      }
      const existing = await fastify.db.execute(sql`
        select id from inventory_availability_override
        where location_id = ${location.id}
          and target_type = ${input.targetType}
          and coalesce(product_id, variation_id, modifier_option_id) = ${input.targetId}
          and cleared_at is null
          and (ends_at is null or ends_at > now())
        limit 1
      `);
      if (existing.rows[0]) {
        throw conflict(
          "inventory.availabilityOverrideAlreadyActive",
          "This item already has an active sold-out override",
        );
      }
      const [created] = await fastify.db
        .insert(inventoryAvailabilityOverridesDB)
        .values({
          id: generateNanoId(),
          locationId: location.id,
          targetType: input.targetType,
          ...(input.targetType === "product" ? { productId: input.targetId } : {}),
          ...(input.targetType === "variation" ? { variationId: input.targetId } : {}),
          ...(input.targetType === "modifier_option"
            ? { modifierOptionId: input.targetId }
            : {}),
          reason: normalizeString(input.reason, { trim: true, collapseWhitespace: true }),
          startsAt: input.startsAt ? new Date(input.startsAt) : new Date(),
          endsAt: input.endsAt ? new Date(input.endsAt) : null,
          createdByUserId: input.userId,
        })
        .returning();
      if (!created) throw new Error("Failed to create availability override");
      const overrides = await this.listAvailabilityOverrides(input);
      const response = overrides.find((override) => override.id === created.id);
      if (!response) throw new Error("Failed to read availability override");
      return response;
    },

    async clearAvailabilityOverride(input) {
      const location = await assertLocationAccess(fastify.db, input);
      const [updated] = await fastify.db
        .update(inventoryAvailabilityOverridesDB)
        .set({ clearedAt: new Date(), clearedByUserId: input.userId, updatedAt: new Date() })
        .where(
          and(
            eq(inventoryAvailabilityOverridesDB.id, input.overrideId),
            eq(inventoryAvailabilityOverridesDB.locationId, location.id),
            isNull(inventoryAvailabilityOverridesDB.clearedAt),
          ),
        )
        .returning({ id: inventoryAvailabilityOverridesDB.id });
      if (!updated) {
        throw notFound(
          "inventory.availabilityOverrideNotFound",
          "Active availability override was not found",
        );
      }
    },

    async listLots(input) {
      const location = await assertLocationAccess(fastify.db, input);
      const currentDate = localDate(location.timezone);
      const result = await fastify.db.execute(sql`
        select
          l.id,
          l.inventory_item_id as "inventoryItemId",
          l.lot_code as "lotCode",
          l.expires_on as "expiresOn",
          b.on_hand_quantity as "onHandQuantity",
          b.reserved_quantity as "reservedQuantity",
          greatest(b.on_hand_quantity - b.reserved_quantity, 0) as "availableQuantity",
          (l.expires_on is not null and l.expires_on < ${currentDate}::date) as "isExpired"
        from inventory_balance b
        inner join inventory_lot l on l.id = b.lot_id
        where b.location_id = ${location.id}
          and (${input.inventoryItemId ?? null}::text is null or b.inventory_item_id = ${input.inventoryItemId ?? null})
        order by l.expires_on asc nulls last, l.created_at asc, l.id asc
      `);
      return result.rows.map((row) => {
        const typed = row as Record<string, unknown>;
        return {
          ...typed,
          onHandQuantity: Number(typed.onHandQuantity ?? 0),
          reservedQuantity: Number(typed.reservedQuantity ?? 0),
          availableQuantity: Number(typed.availableQuantity ?? 0),
        };
      });
    },

    async getSummary(input) {
      const stocks = await this.listStocks(input);
      return {
        trackedItems: stocks.length,
        itemsWithStock: stocks.filter((stock) => stock.onHandQuantity > 0).length,
        lowStockItems: stocks.filter((stock) => stock.isLowStock).length,
        expiredItems: stocks.filter((stock) => stock.expiredQuantity > 0).length,
        deficitItems: stocks.filter((stock) => stock.deficitQuantity > 0).length,
      };
    },

    async listAdjustments(input) {
      await assertLocationAccess(fastify.db, input);
      const rows = await fastify.db
        .select({ id: inventoryAdjustmentsDB.id })
        .from(inventoryAdjustmentsDB)
        .where(eq(inventoryAdjustmentsDB.locationId, input.locationId))
        .orderBy(sql`${inventoryAdjustmentsDB.createdAt} desc`)
        .limit(100);
      return Promise.all(rows.map((row) => getAdjustment(fastify.db, row.id)));
    },

    async createAdjustment(input: CreateInventoryAdjustmentInput) {
      await ensureInventoryCatalog(fastify.db);
      const location = await assertLocationAccess(fastify.db, input);
      const itemRows = await listInventoryItemRows(fastify.db);
      const items = new Map(itemRows.map((item) => [item.id, item]));

      const adjustmentId = await fastify.db.transaction(async (tx) => {
        const adjustmentId = generateNanoId();
        const movementId = generateNanoId();
        await tx.insert(inventoryAdjustmentsDB).values({
          id: adjustmentId,
          locationId: location.id,
          direction: input.direction,
          reason: input.reason,
          observations: input.observations?.trim() || null,
          createdByUserId: input.userId,
        });
        await tx.insert(inventoryMovementsDB).values({
          id: movementId,
          locationId: location.id,
          type: input.direction === "entry" ? "adjustment_entry" : "adjustment_exit",
          adjustmentId,
          actorUserId: input.userId,
        });

        for (const line of input.lines) {
          const item = items.get(line.inventoryItemId);
          if (!item) {
            throw notFound("inventory.itemNotFound", "Inventory item was not found", {
              inventoryItemId: line.inventoryItemId,
            });
          }
          if (!item.isTracked) {
            throw validation("inventory.itemNotTracked", "Inventory item is not tracked", {
              inventoryItemId: item.id,
            });
          }
          await ensureLocationItem(tx, location.id, item.id);
          const lot =
            input.direction === "entry"
              ? await resolveEntryLot(tx, {
                  item,
                  location,
                  lotCode: line.lotCode,
                  expiresOn: line.expiresOn,
                })
              : await resolveExitLot(tx, { item, lotId: line.lotId });
          const delta = input.direction === "entry" ? line.quantity : -line.quantity;
          const balance = await applyBalanceDelta(tx, {
            locationId: location.id,
            inventoryItemId: item.id,
            lotId: lot.id,
            onHandDelta: delta,
          });

          await tx.insert(inventoryAdjustmentLinesDB).values({
            id: generateNanoId(),
            adjustmentId,
            inventoryItemId: item.id,
            lotId: lot.id,
            quantity: line.quantity,
          });
          await tx.insert(inventoryMovementLinesDB).values({
            id: generateNanoId(),
            movementId,
            inventoryItemId: item.id,
            lotId: lot.id,
            onHandDelta: delta,
            reservedDelta: 0,
            onHandAfter: balance.onHandAfter,
            reservedAfter: balance.reservedAfter,
          });
        }

        return adjustmentId;
      });

      return getAdjustment(fastify.db, adjustmentId);
    },

    async reverseAdjustment(input) {
      await assertLocationAccess(fastify.db, input);
      const reversalId = await fastify.db.transaction(async (tx) => {
        const headerResult = await tx.execute(sql`
          select id, location_id as "locationId", direction, reversed_at as "reversedAt"
          from inventory_adjustment
          where id = ${input.adjustmentId} and location_id = ${input.locationId}
          for update
        `);
        const original = headerResult.rows[0] as
          | { id: string; locationId: string; direction: "entry" | "exit"; reversedAt: Date | null }
          | undefined;
        if (!original) {
          throw notFound("inventory.adjustmentNotFound", "Inventory adjustment was not found");
        }
        if (original.reversedAt) {
          throw conflict("inventory.adjustmentAlreadyReversed", "Adjustment is already reversed");
        }
        const lines = await tx
          .select()
          .from(inventoryAdjustmentLinesDB)
          .where(eq(inventoryAdjustmentLinesDB.adjustmentId, original.id));
        const reversalAdjustmentId = generateNanoId();
        const movementId = generateNanoId();
        await tx.insert(inventoryAdjustmentsDB).values({
          id: reversalAdjustmentId,
          locationId: original.locationId,
          direction: original.direction === "entry" ? "exit" : "entry",
          reason: "correction",
          observations: `Reversión exacta del ajuste ${original.id}`,
          createdByUserId: input.userId,
        });
        await tx.insert(inventoryMovementsDB).values({
          id: movementId,
          locationId: original.locationId,
          type: "adjustment_reversal",
          adjustmentId: reversalAdjustmentId,
          actorUserId: input.userId,
        });

        for (const line of lines) {
          const delta = original.direction === "entry" ? -line.quantity : line.quantity;
          const balance = await applyBalanceDelta(tx, {
            locationId: original.locationId,
            inventoryItemId: line.inventoryItemId,
            lotId: line.lotId,
            onHandDelta: delta,
          });
          await tx.insert(inventoryAdjustmentLinesDB).values({
            id: generateNanoId(),
            adjustmentId: reversalAdjustmentId,
            inventoryItemId: line.inventoryItemId,
            lotId: line.lotId,
            quantity: line.quantity,
          });
          await tx.insert(inventoryMovementLinesDB).values({
            id: generateNanoId(),
            movementId,
            inventoryItemId: line.inventoryItemId,
            lotId: line.lotId,
            onHandDelta: delta,
            reservedDelta: 0,
            onHandAfter: balance.onHandAfter,
            reservedAfter: balance.reservedAfter,
          });
        }

        await tx
          .update(inventoryAdjustmentsDB)
          .set({
            reversedAt: new Date(),
            reversedByUserId: input.userId,
            reversalAdjustmentId,
            updatedAt: new Date(),
          })
          .where(eq(inventoryAdjustmentsDB.id, original.id));

        return reversalAdjustmentId;
      });

      return getAdjustment(fastify.db, reversalId);
    },

    async getActivationPreview(input) {
      const location = await assertLocationAccess(fastify.db, input);
      await ensureInventoryCatalog(fastify.db);
      const [workOrders, reservations, trackedItems, itemsWithStock] = await Promise.all([
        location.organizationId
          ? fastify.db
              .select({ count: sql<number>`count(*)::int` })
              .from(workOrdersDB)
              .where(
                and(
                  eq(workOrdersDB.organizationId, location.organizationId),
                  eq(workOrdersDB.status, "open"),
                ),
              )
          : Promise.resolve([{ count: 0 }]),
        fastify.db
          .select({ count: sql<number>`count(*)::int` })
          .from(inventoryReservationsDB)
          .where(
            and(
              eq(inventoryReservationsDB.locationId, location.id),
              inArray(inventoryReservationsDB.status, ["active", "partially_consumed"]),
            ),
          ),
        fastify.db
          .select({ count: sql<number>`count(*)::int` })
          .from(inventoryItemsDB)
          .where(eq(inventoryItemsDB.isTracked, true)),
        fastify.db
          .select({ count: sql<number>`count(distinct ${inventoryBalancesDB.inventoryItemId})::int` })
          .from(inventoryBalancesDB)
          .where(
            and(
              eq(inventoryBalancesDB.locationId, location.id),
              ne(inventoryBalancesDB.onHandQuantity, 0),
            ),
          ),
      ]);
      const openWorkOrders = Number(workOrders[0]?.count ?? 0);
      const activeReservations = Number(reservations[0]?.count ?? 0);
      const tracked = Number(trackedItems[0]?.count ?? 0);
      const stocked = Number(itemsWithStock[0]?.count ?? 0);
      return {
        locationId: location.id,
        openWorkOrders,
        activeReservations,
        trackedItems: tracked,
        itemsWithoutStock: Math.max(0, tracked - stocked),
        canActivate:
          location.type === "branch" && openWorkOrders === 0 && activeReservations === 0,
      };
    },

    async activateLocation(input) {
      const location = await assertLocationAccess(fastify.db, input);
      if (location.type !== "branch") {
        throw validation(
          "inventory.distributionCenterCannotActivateSales",
          "Distribution centers do not activate sales enforcement",
        );
      }
      const preview = await this.getActivationPreview(input);
      if (!input.previewAcknowledged || !preview.canActivate) {
        throw conflict(
          "inventory.activationBlocked",
          "Inventory activation requirements are not satisfied",
          { ...preview },
        );
      }
      if (preview.itemsWithoutStock > 0 && !input.confirmZeroBalances) {
        throw validation(
          "inventory.zeroBalancesConfirmationRequired",
          "Zero inventory balances must be explicitly confirmed",
          { itemsWithoutStock: preview.itemsWithoutStock },
        );
      }
      const [updated] = await fastify.db
        .update(inventoryLocationsDB)
        .set({
          salesEnforcementEnabled: true,
          activatedAt: new Date(),
          activatedByUserId: input.userId,
          deactivatedAt: null,
          deactivatedByUserId: null,
          deactivationReason: null,
          updatedAt: new Date(),
        })
        .where(eq(inventoryLocationsDB.id, location.id))
        .returning();
      if (!updated) {
        throw new Error("Failed to activate inventory location");
      }
      return mapLocation(updated);
    },

    async deactivateLocation(input) {
      const location = await assertLocationAccess(fastify.db, input);
      const preview = await this.getActivationPreview(input);
      if (preview.openWorkOrders > 0 || preview.activeReservations > 0) {
        throw conflict(
          "inventory.deactivationBlocked",
          "Open work orders or reservations prevent deactivation",
          { ...preview },
        );
      }
      const [updated] = await fastify.db
        .update(inventoryLocationsDB)
        .set({
          salesEnforcementEnabled: false,
          deactivatedAt: new Date(),
          deactivatedByUserId: input.userId,
          deactivationReason: normalizeString(input.reason, {
            trim: true,
            collapseWhitespace: true,
          }),
          updatedAt: new Date(),
        })
        .where(eq(inventoryLocationsDB.id, location.id))
        .returning();
      if (!updated) {
        throw new Error("Failed to deactivate inventory location");
      }
      return mapLocation(updated);
    },
  };
}
