import {
  inventoryBalancesDB,
  inventoryLocationAccessDB,
  inventoryLocationItemsDB,
  inventoryLocationsDB,
  inventoryLotsDB,
  inventoryMovementLinesDB,
  inventoryMovementsDB,
  purchaseOrderEventsDB,
  purchaseOrderFolioCountersDB,
  purchaseOrderItemsDB,
  purchaseOrderItemTaxesDB,
  purchaseOrdersDB,
  purchaseReceiptAllocationsDB,
  purchaseReceiptsDB,
  suppliersDB,
  taxDB,
  userDB,
  type InventoryLocation,
  type PurchaseOrderEventType,
  type PurchaseOrderStatus,
} from "@core/db/schemas";
import {
  conflict,
  forbidden,
  generateNanoId,
  normalizeString,
  notFound,
  validation,
} from "@core/utils";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  calculateBaseQuantity,
  calculatePurchaseLineTotals,
  roundPurchaseQuantity,
} from "./purchaseOrders.calculations";
import type {
  AdminPurchaseOrdersService,
  PurchaseOrderActorContext,
  PurchaseOrderCatalogPresentation,
  PurchaseOrderDetail,
  PurchaseOrderDraftInput,
  PurchaseOrderDraftLineInput,
  PurchaseOrderEventResponse,
  PurchaseOrderLineResponse,
  PurchaseOrderListItem,
  PurchaseReceiptInput,
  PurchaseReceiptResponse,
} from "./purchaseOrders.types";

type TransactionDb = Parameters<Parameters<FastifyInstance["db"]["transaction"]>[0]>[0];
type PurchaseDb = FastifyInstance["db"] | TransactionDb;
const EPSILON = 0.0000001;

interface OrderHeaderRow {
  id: string;
  folio: string;
  status: PurchaseOrderStatus;
  supplierId: string;
  supplierName: string;
  locationId: string;
  locationName: string;
  locationType: "branch" | "distribution_center";
  locationTimezone: string;
  currency: "MXN";
  quoteReference: string | null;
  observations: string | null;
  expectedDeliveryOn: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  cancellationReason: string | null;
  closeReason: string | null;
  createdAt: Date;
  issuedAt: Date | null;
}

interface PresentationRow {
  presentationId: string;
  supplierItemId: string;
  itemType: "ingredient" | "supply";
  itemId: string;
  itemName: string;
  presentationName: string;
  contentQuantity: number;
  baseUnitId: string;
  baseUnitName: string;
  baseUnitAbbreviation: string;
  baseUnitPrecision: number;
  inventoryItemId: string | null;
  isTracked: boolean;
  tracksLots: boolean;
  isPerishable: boolean;
  isDefault: boolean;
  referencePriceCents: number | null;
}

interface ReceiptOrderLine {
  id: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unitPriceCents: number;
  contentQuantity: number;
  baseUnitPrecision: number;
  inventoryItemId: string | null;
  isTracked: boolean;
  tracksLots: boolean;
  isPerishable: boolean;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  taxRates: number[];
}

function optionalText(value: string | null | undefined) {
  if (value == null) return null;
  const normalized = normalizeString(value, { trim: true, collapseWhitespace: true });
  return normalized.length > 0 ? normalized : null;
}

function dateInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function purchaseYear() {
  return Number(dateInTimezone(new Date(), "America/Mexico_City").slice(0, 4));
}

async function isGlobalOwner(db: PurchaseDb, userId: string) {
  const [user] = await db
    .select({ role: userDB.role })
    .from(userDB)
    .where(eq(userDB.id, userId))
    .limit(1);
  return user?.role === "owner";
}

async function assertLocationAccess(
  db: PurchaseDb,
  context: PurchaseOrderActorContext & { locationId: string },
) {
  const [location] = await db
    .select()
    .from(inventoryLocationsDB)
    .where(
      and(eq(inventoryLocationsDB.id, context.locationId), isNull(inventoryLocationsDB.deletedAt)),
    )
    .limit(1);
  if (!location) {
    throw notFound("purchaseOrder.locationNotFound", "Inventory location was not found");
  }
  if (await isGlobalOwner(db, context.userId)) return location;
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
    throw forbidden(
      "purchaseOrder.locationAccessDenied",
      "You cannot access this inventory location",
    );
  }
  return location;
}

async function syncPurchasableInventoryItems(db: PurchaseDb) {
  await db.execute(sql`
    insert into inventory_item (
      id, kind, ingredient_id, base_unit_id, is_tracked, tracks_lots,
      is_perishable, expiration_warning_days
    )
    select 'inv_ing_' || i.id, 'ingredient', i.id, i.base_unit_id,
      i.is_inventory_tracked, i.tracks_lots, i.is_perishable, i.expiration_warning_days
    from ingredient i
    on conflict (ingredient_id) where ingredient_id is not null do update set
      base_unit_id = excluded.base_unit_id, is_tracked = excluded.is_tracked,
      tracks_lots = excluded.tracks_lots, is_perishable = excluded.is_perishable,
      expiration_warning_days = excluded.expiration_warning_days, updated_at = now()
  `);
  await db.execute(sql`
    insert into inventory_item (
      id, kind, supply_id, base_unit_id, is_tracked, tracks_lots,
      is_perishable, expiration_warning_days
    )
    select 'inv_sup_' || s.id, 'supply', s.id, s.base_unit_id,
      s.is_inventory_tracked, s.tracks_lots, s.is_perishable, s.expiration_warning_days
    from supply s
    on conflict (supply_id) where supply_id is not null do update set
      base_unit_id = excluded.base_unit_id, is_tracked = excluded.is_tracked,
      tracks_lots = excluded.tracks_lots, is_perishable = excluded.is_perishable,
      expiration_warning_days = excluded.expiration_warning_days, updated_at = now()
  `);
}

async function addEvent(
  db: TransactionDb,
  input: {
    purchaseOrderId: string;
    actorUserId: string;
    type: PurchaseOrderEventType;
    metadata?: Record<string, unknown>;
  },
) {
  await db.insert(purchaseOrderEventsDB).values({
    id: generateNanoId(),
    purchaseOrderId: input.purchaseOrderId,
    actorUserId: input.actorUserId,
    type: input.type,
    metadata: input.metadata ?? {},
  });
}

async function nextOrderFolio(tx: TransactionDb) {
  const year = purchaseYear();
  await tx
    .insert(purchaseOrderFolioCountersDB)
    .values({ year, lastSequence: 0 })
    .onConflictDoNothing();
  const result = await tx.execute(sql`
    select year, last_sequence as "lastSequence"
    from purchase_order_folio_counter
    where year = ${year}
    for update
  `);
  const current = result.rows[0] as { year: number; lastSequence: number } | undefined;
  if (!current) throw new Error("Failed to lock purchase order folio counter");
  const sequence = Number(current.lastSequence) + 1;
  await tx
    .update(purchaseOrderFolioCountersDB)
    .set({ lastSequence: sequence, updatedAt: new Date() })
    .where(eq(purchaseOrderFolioCountersDB.year, year));
  return { year, sequence, folio: `OC-${year}-${String(sequence).padStart(6, "0")}` };
}

async function loadPresentation(
  db: PurchaseDb,
  supplierId: string,
  presentationId: string,
): Promise<PresentationRow> {
  const result = await db.execute(sql`
    select
      p.id as "presentationId", si.id as "supplierItemId",
      case when si.ingredient_id is not null then 'ingredient' else 'supply' end as "itemType",
      coalesce(si.ingredient_id, si.supply_id) as "itemId",
      coalesce(i.name, s.name) as "itemName", p.name as "presentationName",
      p.content_quantity as "contentQuantity", u.id as "baseUnitId", u.name as "baseUnitName",
      u.abbreviation as "baseUnitAbbreviation", u.precision as "baseUnitPrecision",
      ii.id as "inventoryItemId", coalesce(ii.is_tracked, false) as "isTracked",
      coalesce(ii.tracks_lots, false) as "tracksLots",
      coalesce(ii.is_perishable, false) as "isPerishable", p.is_default as "isDefault",
      c.price_cents as "referencePriceCents"
    from supplier_item_presentation p
    inner join supplier_item si on si.id = p.supplier_item_id
    inner join supplier sp on sp.id = si.supplier_id
    left join ingredient i on i.id = si.ingredient_id
    left join supply s on s.id = si.supply_id
    inner join unit u on u.id = coalesce(i.base_unit_id, s.base_unit_id)
    left join inventory_item ii
      on ii.ingredient_id = si.ingredient_id or ii.supply_id = si.supply_id
    left join supplier_presentation_cost c
      on c.presentation_id = p.id and c.effective_to is null
    where p.id = ${presentationId} and si.supplier_id = ${supplierId}
      and sp.deleted_at is null and si.deleted_at is null and p.deleted_at is null
      and coalesce(i.deleted_at, s.deleted_at) is null
    limit 1
  `);
  const row = result.rows[0] as unknown as PresentationRow | undefined;
  if (!row) {
    throw validation(
      "purchaseOrder.presentationUnavailable",
      "Presentation is not active or does not belong to the supplier",
      { presentationId },
    );
  }
  return {
    ...row,
    contentQuantity: Number(row.contentQuantity),
    baseUnitPrecision: Number(row.baseUnitPrecision),
    referencePriceCents: row.referencePriceCents == null ? null : Number(row.referencePriceCents),
  };
}

async function loadTaxes(db: PurchaseDb, taxIds: string[]) {
  const unique = [...new Set(taxIds)];
  if (unique.length === 0) return [];
  const rows = await db
    .select({ id: taxDB.id, name: taxDB.name, rate: taxDB.rate })
    .from(taxDB)
    .where(inArray(taxDB.id, unique));
  if (rows.length !== unique.length) {
    throw validation("purchaseOrder.taxNotFound", "One or more taxes were not found");
  }
  const byId = new Map(rows.map((row) => [row.id, row]));
  return unique.map((id) => byId.get(id)!);
}

async function replaceDraftLines(
  tx: TransactionDb,
  input: {
    purchaseOrderId: string;
    supplierId: string;
    observations: string | null;
    lines: PurchaseOrderDraftLineInput[];
  },
) {
  await syncPurchasableInventoryItems(tx);
  await tx
    .delete(purchaseOrderItemsDB)
    .where(eq(purchaseOrderItemsDB.purchaseOrderId, input.purchaseOrderId));
  let subtotalCents = 0;
  let taxCents = 0;
  for (const [sortOrder, line] of input.lines.entries()) {
    const presentation = await loadPresentation(tx, input.supplierId, line.presentationId);
    const base = calculateBaseQuantity(
      line.quantity,
      presentation.contentQuantity,
      presentation.baseUnitPrecision,
    );
    if (!base.respectsPrecision) {
      throw validation(
        "purchaseOrder.baseUnitPrecisionExceeded",
        "Presentation quantity does not respect the base unit precision",
        { presentationId: line.presentationId, baseUnitPrecision: presentation.baseUnitPrecision },
      );
    }
    const taxes = await loadTaxes(tx, line.taxIds);
    const totals = calculatePurchaseLineTotals(
      line.quantity,
      line.unitPriceCents,
      taxes.map((tax) => tax.rate),
    );
    const itemId = generateNanoId();
    await tx.insert(purchaseOrderItemsDB).values({
      id: itemId,
      purchaseOrderId: input.purchaseOrderId,
      supplierItemId: presentation.supplierItemId,
      presentationId: presentation.presentationId,
      inventoryItemId: presentation.inventoryItemId,
      isTrackedSnapshot: presentation.isTracked,
      tracksLotsSnapshot: presentation.tracksLots,
      isPerishableSnapshot: presentation.isPerishable,
      itemType: presentation.itemType,
      itemNameSnapshot: presentation.itemName,
      presentationNameSnapshot: presentation.presentationName,
      baseUnitId: presentation.baseUnitId,
      baseUnitNameSnapshot: presentation.baseUnitName,
      baseUnitAbbreviationSnapshot: presentation.baseUnitAbbreviation,
      baseUnitPrecisionSnapshot: presentation.baseUnitPrecision,
      contentQuantitySnapshot: presentation.contentQuantity,
      orderedPresentationQuantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      subtotalCents: totals.subtotalCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      sortOrder,
    });
    if (taxes.length > 0) {
      await tx.insert(purchaseOrderItemTaxesDB).values(
        taxes.map((tax, index) => ({
          purchaseOrderItemId: itemId,
          taxId: tax.id,
          taxNameSnapshot: tax.name,
          taxRateBpsSnapshot: tax.rate,
          taxAmountCents: totals.taxAmountsCents[index] ?? 0,
        })),
      );
    }
    subtotalCents += totals.subtotalCents;
    taxCents += totals.taxCents;
  }
  if (input.lines.some((line) => line.unitPriceCents === 0) && !input.observations) {
    throw validation(
      "purchaseOrder.zeroPriceObservationsRequired",
      "Observations are required when a line has a zero price",
    );
  }
  await tx
    .update(purchaseOrdersDB)
    .set({ subtotalCents, taxCents, totalCents: subtotalCents + taxCents, updatedAt: new Date() })
    .where(eq(purchaseOrdersDB.id, input.purchaseOrderId));
}

async function lockOrder(tx: TransactionDb, purchaseOrderId: string) {
  const result = await tx.execute(sql`
    select id, status, supplier_id as "supplierId", location_id as "locationId",
      observations, folio, issued_at as "issuedAt",
      location_timezone_snapshot as "locationTimezone"
    from purchase_order where id = ${purchaseOrderId} for update
  `);
  const order = result.rows[0] as
    | {
        id: string;
        status: PurchaseOrderStatus;
        supplierId: string;
        locationId: string;
        observations: string | null;
        folio: string;
        issuedAt: Date | null;
        locationTimezone: string;
      }
    | undefined;
  if (!order) throw notFound("purchaseOrder.notFound", "Purchase order was not found");
  return order;
}

async function assertOrderAccess(
  db: PurchaseDb,
  context: PurchaseOrderActorContext & { purchaseOrderId: string },
) {
  const result = await db.execute(sql`
    select location_id as "locationId" from purchase_order where id = ${context.purchaseOrderId}
  `);
  const row = result.rows[0] as { locationId: string } | undefined;
  if (!row) throw notFound("purchaseOrder.notFound", "Purchase order was not found");
  return assertLocationAccess(db, { ...context, locationId: row.locationId });
}

async function readHeader(db: PurchaseDb, purchaseOrderId: string): Promise<OrderHeaderRow> {
  const result = await db.execute(sql`
    select po.id, po.folio, po.status, po.supplier_id as "supplierId",
      po.supplier_name_snapshot as "supplierName", po.location_id as "locationId",
      po.location_name_snapshot as "locationName", l.type as "locationType",
      po.location_timezone_snapshot as "locationTimezone", po.currency,
      po.quote_reference as "quoteReference", po.observations,
      po.expected_delivery_on as "expectedDeliveryOn", po.subtotal_cents as "subtotalCents",
      po.tax_cents as "taxCents", po.total_cents as "totalCents",
      po.cancellation_reason as "cancellationReason", po.close_reason as "closeReason",
      po.created_at as "createdAt", po.issued_at as "issuedAt"
    from purchase_order po
    inner join inventory_location l on l.id = po.location_id
    where po.id = ${purchaseOrderId}
    limit 1
  `);
  const row = result.rows[0] as unknown as OrderHeaderRow | undefined;
  if (!row) throw notFound("purchaseOrder.notFound", "Purchase order was not found");
  return {
    ...row,
    subtotalCents: Number(row.subtotalCents),
    taxCents: Number(row.taxCents),
    totalCents: Number(row.totalCents),
  };
}

async function readLines(
  db: PurchaseDb,
  purchaseOrderId: string,
): Promise<PurchaseOrderLineResponse[]> {
  const result = await db.execute(sql`
    select poi.id, poi.presentation_id as "presentationId", poi.supplier_item_id as "supplierItemId",
      poi.item_type as "itemType", poi.item_name_snapshot as "itemName",
      poi.presentation_name_snapshot as "presentationName", poi.inventory_item_id as "inventoryItemId",
      poi.is_tracked_snapshot as "isTracked", poi.tracks_lots_snapshot as "tracksLots",
      poi.is_perishable_snapshot as "isPerishable", poi.base_unit_id as "baseUnitId",
      poi.base_unit_name_snapshot as "baseUnitName",
      poi.base_unit_abbreviation_snapshot as "baseUnitAbbreviation",
      poi.base_unit_precision_snapshot as "baseUnitPrecision",
      poi.content_quantity_snapshot as "contentQuantity",
      poi.ordered_presentation_quantity as "orderedQuantity",
      poi.received_presentation_quantity as "receivedQuantity",
      poi.unit_price_cents as "unitPriceCents", poi.subtotal_cents as "subtotalCents",
      poi.tax_cents as "taxCents", poi.total_cents as "totalCents",
      coalesce(sum(pra.subtotal_cents) filter (where pr.status = 'applied'), 0) as "receivedSubtotalCents",
      coalesce(sum(pra.tax_cents) filter (where pr.status = 'applied'), 0) as "receivedTaxCents",
      coalesce(sum(pra.total_cents) filter (where pr.status = 'applied'), 0) as "receivedTotalCents"
    from purchase_order_item poi
    left join purchase_receipt_allocation pra on pra.purchase_order_item_id = poi.id
    left join purchase_receipt pr on pr.id = pra.receipt_id
    where poi.purchase_order_id = ${purchaseOrderId}
    group by poi.id
    order by poi.sort_order, poi.id
  `);
  const taxResult = await db.execute(sql`
    select poit.purchase_order_item_id as "purchaseOrderItemId", poit.tax_id as id,
      poit.tax_name_snapshot as name, poit.tax_rate_bps_snapshot as rate,
      poit.tax_amount_cents as "amountCents"
    from purchase_order_item_tax poit
    inner join purchase_order_item poi on poi.id = poit.purchase_order_item_id
    where poi.purchase_order_id = ${purchaseOrderId}
    order by poit.tax_name_snapshot, poit.tax_id
  `);
  const taxesByItem = new Map<string, PurchaseOrderLineResponse["taxes"]>();
  for (const raw of taxResult.rows) {
    const row = raw as {
      purchaseOrderItemId: string;
      id: string;
      name: string;
      rate: number;
      amountCents: number;
    };
    const taxes = taxesByItem.get(row.purchaseOrderItemId) ?? [];
    taxes.push({
      id: row.id,
      name: row.name,
      rate: Number(row.rate),
      amountCents: Number(row.amountCents),
    });
    taxesByItem.set(row.purchaseOrderItemId, taxes);
  }
  return result.rows.map((raw) => {
    const row = raw as Record<string, unknown>;
    const ordered = Number(row.orderedQuantity);
    const received = Number(row.receivedQuantity);
    const content = Number(row.contentQuantity);
    return {
      id: String(row.id),
      presentationId: String(row.presentationId),
      supplierItemId: String(row.supplierItemId),
      itemType: row.itemType as "ingredient" | "supply",
      itemName: String(row.itemName),
      presentationName: String(row.presentationName),
      inventoryItemId: row.inventoryItemId == null ? null : String(row.inventoryItemId),
      isTracked: Boolean(row.isTracked),
      tracksLots: Boolean(row.tracksLots),
      isPerishable: Boolean(row.isPerishable),
      baseUnit: {
        id: String(row.baseUnitId),
        name: String(row.baseUnitName),
        abbreviation: String(row.baseUnitAbbreviation),
        precision: Number(row.baseUnitPrecision),
      },
      contentQuantity: content,
      orderedQuantity: ordered,
      receivedQuantity: received,
      pendingQuantity: roundPurchaseQuantity(ordered - received),
      unitPriceCents: Number(row.unitPriceCents),
      baseUnitCost: Number(row.unitPriceCents) / content,
      subtotalCents: Number(row.subtotalCents),
      taxCents: Number(row.taxCents),
      totalCents: Number(row.totalCents),
      receivedSubtotalCents: Number(row.receivedSubtotalCents),
      receivedTaxCents: Number(row.receivedTaxCents),
      receivedTotalCents: Number(row.receivedTotalCents),
      taxes: taxesByItem.get(String(row.id)) ?? [],
    };
  });
}

async function readReceipts(
  db: PurchaseDb,
  purchaseOrderId: string,
): Promise<PurchaseReceiptResponse[]> {
  const receiptResult = await db.execute(sql`
    select pr.id, pr.folio, pr.sequence, pr.status, pr.received_on as "receivedOn",
      pr.supplier_document_reference as "supplierDocumentReference", pr.observations,
      pr.subtotal_cents as "subtotalCents", pr.tax_cents as "taxCents", pr.total_cents as "totalCents",
      pr.corrects_receipt_id as "correctsReceiptId", pr.replacement_receipt_id as "replacementReceiptId",
      pr.reversed_at as "reversedAt", pr.reversal_reason as "reversalReason", pr.created_at as "createdAt",
      ru.id as "receivedById", concat_ws(' ', ru.name, ru.middle_name, ru.last_name) as "receivedByName",
      vu.id as "reversedById", concat_ws(' ', vu.name, vu.middle_name, vu.last_name) as "reversedByName"
    from purchase_receipt pr
    inner join "user" ru on ru.id = pr.received_by_user_id
    left join "user" vu on vu.id = pr.reversed_by_user_id
    where pr.purchase_order_id = ${purchaseOrderId}
    order by pr.sequence desc
  `);
  const allocationResult = await db.execute(sql`
    select pra.id, pra.receipt_id as "receiptId", pra.purchase_order_item_id as "purchaseOrderItemId",
      poi.item_name_snapshot as "itemName", poi.presentation_name_snapshot as "presentationName",
      pra.presentation_quantity as "presentationQuantity", pra.base_quantity as "baseQuantity",
      poi.base_unit_abbreviation_snapshot as "baseUnitAbbreviation",
      pra.lot_code_snapshot as "lotCode", pra.expires_on_snapshot as "expiresOn",
      pra.subtotal_cents as "subtotalCents", pra.tax_cents as "taxCents", pra.total_cents as "totalCents"
    from purchase_receipt_allocation pra
    inner join purchase_receipt pr on pr.id = pra.receipt_id
    inner join purchase_order_item poi on poi.id = pra.purchase_order_item_id
    where pr.purchase_order_id = ${purchaseOrderId}
    order by pra.created_at, pra.id
  `);
  const allocations = new Map<string, PurchaseReceiptResponse["allocations"]>();
  for (const raw of allocationResult.rows) {
    const row = raw as Record<string, unknown>;
    const rows = allocations.get(String(row.receiptId)) ?? [];
    rows.push({
      id: String(row.id),
      purchaseOrderItemId: String(row.purchaseOrderItemId),
      itemName: String(row.itemName),
      presentationName: String(row.presentationName),
      presentationQuantity: Number(row.presentationQuantity),
      baseQuantity: Number(row.baseQuantity),
      baseUnitAbbreviation: String(row.baseUnitAbbreviation),
      lotCode: row.lotCode == null ? null : String(row.lotCode),
      expiresOn: row.expiresOn == null ? null : String(row.expiresOn),
      subtotalCents: Number(row.subtotalCents),
      taxCents: Number(row.taxCents),
      totalCents: Number(row.totalCents),
    });
    allocations.set(String(row.receiptId), rows);
  }
  return receiptResult.rows.map((raw) => {
    const row = raw as Record<string, unknown>;
    return {
      id: String(row.id),
      folio: String(row.folio),
      sequence: Number(row.sequence),
      status: row.status as "applied" | "reversed",
      receivedOn: String(row.receivedOn),
      supplierDocumentReference:
        row.supplierDocumentReference == null ? null : String(row.supplierDocumentReference),
      observations: row.observations == null ? null : String(row.observations),
      subtotalCents: Number(row.subtotalCents),
      taxCents: Number(row.taxCents),
      totalCents: Number(row.totalCents),
      correctsReceiptId: row.correctsReceiptId == null ? null : String(row.correctsReceiptId),
      replacementReceiptId:
        row.replacementReceiptId == null ? null : String(row.replacementReceiptId),
      receivedBy: { id: String(row.receivedById), name: String(row.receivedByName) },
      reversedAt: row.reversedAt as Date | null,
      reversedBy:
        row.reversedById == null
          ? null
          : { id: String(row.reversedById), name: String(row.reversedByName) },
      reversalReason: row.reversalReason == null ? null : String(row.reversalReason),
      createdAt: row.createdAt as Date,
      allocations: allocations.get(String(row.id)) ?? [],
    };
  });
}

async function readEvents(
  db: PurchaseDb,
  purchaseOrderId: string,
): Promise<PurchaseOrderEventResponse[]> {
  const result = await db.execute(sql`
    select e.id, e.type, e.metadata, e.created_at as "createdAt", u.id as "actorId",
      concat_ws(' ', u.name, u.middle_name, u.last_name) as "actorName"
    from purchase_order_event e inner join "user" u on u.id = e.actor_user_id
    where e.purchase_order_id = ${purchaseOrderId}
    order by e.created_at desc, e.id desc
  `);
  return result.rows.map((raw) => {
    const row = raw as Record<string, unknown>;
    return {
      id: String(row.id),
      type: row.type as PurchaseOrderEventType,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
      actor: { id: String(row.actorId), name: String(row.actorName) },
      createdAt: row.createdAt as Date,
    };
  });
}

function listItemFromDetail(
  header: OrderHeaderRow,
  lines: PurchaseOrderLineResponse[],
): PurchaseOrderListItem {
  const receivedTotalCents = lines.reduce((sum, line) => sum + line.receivedTotalCents, 0);
  const today = dateInTimezone(new Date(), header.locationTimezone);
  return {
    id: header.id,
    folio: header.folio,
    status: header.status,
    supplier: { id: header.supplierId, name: header.supplierName },
    location: { id: header.locationId, name: header.locationName, type: header.locationType },
    currency: "MXN",
    expectedDeliveryOn: header.expectedDeliveryOn,
    isOverdue:
      ["issued", "partially_received"].includes(header.status) &&
      Boolean(header.expectedDeliveryOn && header.expectedDeliveryOn < today),
    subtotalCents: header.subtotalCents,
    taxCents: header.taxCents,
    totalCents: header.totalCents,
    receivedTotalCents,
    pendingTotalCents: Math.max(0, header.totalCents - receivedTotalCents),
    itemCount: lines.length,
    createdAt: header.createdAt,
    issuedAt: header.issuedAt,
  };
}

async function getDetail(
  db: PurchaseDb,
  context: PurchaseOrderActorContext & { purchaseOrderId: string },
): Promise<PurchaseOrderDetail> {
  await assertOrderAccess(db, context);
  const [header, lines, receipts, events] = await Promise.all([
    readHeader(db, context.purchaseOrderId),
    readLines(db, context.purchaseOrderId),
    readReceipts(db, context.purchaseOrderId),
    readEvents(db, context.purchaseOrderId),
  ]);
  return {
    ...listItemFromDetail(header, lines),
    quoteReference: header.quoteReference,
    observations: header.observations,
    locationTimezone: header.locationTimezone,
    cancellationReason: header.cancellationReason,
    closeReason: header.closeReason,
    lines,
    receipts,
    events,
  };
}

async function createDraftTx(
  tx: TransactionDb,
  context: PurchaseOrderActorContext,
  input: PurchaseOrderDraftInput,
  duplicatedFromId?: string,
) {
  const [supplier] = await tx
    .select({ id: suppliersDB.id, name: suppliersDB.name })
    .from(suppliersDB)
    .where(and(eq(suppliersDB.id, input.supplierId), isNull(suppliersDB.deletedAt)))
    .limit(1);
  if (!supplier) throw validation("purchaseOrder.supplierUnavailable", "Supplier is not active");
  const location = await assertLocationAccess(tx, { ...context, locationId: input.locationId });
  const folio = await nextOrderFolio(tx);
  const id = generateNanoId();
  const observations = optionalText(input.observations);
  await tx.insert(purchaseOrdersDB).values({
    id,
    folio: folio.folio,
    folioYear: folio.year,
    folioSequence: folio.sequence,
    supplierId: supplier.id,
    locationId: location.id,
    supplierNameSnapshot: supplier.name,
    locationNameSnapshot: location.name,
    locationTimezoneSnapshot: location.timezone,
    quoteReference: optionalText(input.quoteReference),
    observations,
    expectedDeliveryOn: input.expectedDeliveryOn ?? null,
    createdByUserId: context.userId,
  });
  await replaceDraftLines(tx, {
    purchaseOrderId: id,
    supplierId: supplier.id,
    observations,
    lines: input.lines,
  });
  await addEvent(tx, {
    purchaseOrderId: id,
    actorUserId: context.userId,
    type: duplicatedFromId ? "duplicated" : "created",
    metadata: duplicatedFromId ? { duplicatedFromId } : {},
  });
  return id;
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
    select on_hand_quantity as "onHandQuantity", reserved_quantity as "reservedQuantity"
    from inventory_balance where location_id = ${locationId}
      and inventory_item_id = ${inventoryItemId} and lot_id = ${lotId} for update
  `);
  const row = result.rows[0] as
    | { onHandQuantity: number | string; reservedQuantity: number | string }
    | undefined;
  if (!row) throw new Error("Failed to lock inventory balance");
  return { onHand: Number(row.onHandQuantity), reserved: Number(row.reservedQuantity) };
}

async function applyInventoryDelta(
  tx: TransactionDb,
  input: { locationId: string; inventoryItemId: string; lotId: string; delta: number },
) {
  const balance = await lockBalance(tx, input.locationId, input.inventoryItemId, input.lotId);
  const onHandAfter = roundPurchaseQuantity(balance.onHand + input.delta);
  if (
    onHandAfter < -EPSILON ||
    (input.delta < 0 && balance.onHand - balance.reserved + input.delta < -EPSILON)
  ) {
    throw conflict(
      "purchaseOrder.receiptStockCommitted",
      "Receipt inventory is no longer available for reversal",
      {
        inventoryItemId: input.inventoryItemId,
        lotId: input.lotId,
      },
    );
  }
  await tx
    .update(inventoryBalancesDB)
    .set({ onHandQuantity: Math.max(0, onHandAfter), updatedAt: new Date() })
    .where(
      and(
        eq(inventoryBalancesDB.locationId, input.locationId),
        eq(inventoryBalancesDB.inventoryItemId, input.inventoryItemId),
        eq(inventoryBalancesDB.lotId, input.lotId),
      ),
    );
  return { onHandAfter: Math.max(0, onHandAfter), reservedAfter: balance.reserved };
}

async function resolveReceiptLot(
  tx: TransactionDb,
  input: {
    line: ReceiptOrderLine;
    location: InventoryLocation;
    lotCode?: string | null;
    expiresOn?: string | null;
  },
) {
  const lotCode = optionalText(input.lotCode);
  const normalizedLotCode = lotCode?.toLocaleLowerCase("es-MX") ?? null;
  const expiresOn = input.expiresOn ?? null;
  if (input.line.tracksLots && !lotCode)
    throw validation("purchaseOrder.lotCodeRequired", "Lot code is required for this item");
  if (input.line.isPerishable && !expiresOn)
    throw validation(
      "purchaseOrder.expirationRequired",
      "Expiration date is required for this perishable item",
    );
  if (expiresOn && expiresOn < dateInTimezone(new Date(), input.location.timezone)) {
    throw validation("purchaseOrder.expirationInPast", "Expiration date cannot be in the past");
  }
  if (normalizedLotCode) {
    const [existing] = await tx
      .select()
      .from(inventoryLotsDB)
      .where(
        and(
          eq(inventoryLotsDB.inventoryItemId, input.line.inventoryItemId!),
          eq(inventoryLotsDB.normalizedLotCode, normalizedLotCode),
        ),
      )
      .limit(1);
    if (existing) {
      if (existing.expiresOn !== expiresOn)
        throw conflict(
          "purchaseOrder.lotExpirationMismatch",
          "Lot already exists with another expiration date",
        );
      return existing;
    }
  } else if (!input.line.isPerishable) {
    const [existing] = await tx
      .select()
      .from(inventoryLotsDB)
      .where(
        and(
          eq(inventoryLotsDB.inventoryItemId, input.line.inventoryItemId!),
          eq(inventoryLotsDB.internalBatchKey, "default"),
        ),
      )
      .limit(1);
    if (existing) return existing;
  }
  const [created] = await tx
    .insert(inventoryLotsDB)
    .values({
      id: generateNanoId(),
      inventoryItemId: input.line.inventoryItemId!,
      lotCode,
      normalizedLotCode,
      internalBatchKey: normalizedLotCode ? `lot:${normalizedLotCode}` : generateNanoId(),
      expiresOn,
    })
    .returning();
  if (!created) throw new Error("Failed to create inventory lot");
  return created;
}

async function loadReceiptLines(
  tx: TransactionDb,
  purchaseOrderId: string,
): Promise<Map<string, ReceiptOrderLine>> {
  await tx.execute(sql`
    select id from purchase_order_item
    where purchase_order_id = ${purchaseOrderId}
    order by sort_order, id
    for update
  `);
  const result = await tx.execute(sql`
    select poi.id, poi.ordered_presentation_quantity as "orderedQuantity",
      poi.received_presentation_quantity as "receivedQuantity", poi.unit_price_cents as "unitPriceCents",
      poi.content_quantity_snapshot as "contentQuantity", poi.base_unit_precision_snapshot as "baseUnitPrecision",
      poi.inventory_item_id as "inventoryItemId", poi.is_tracked_snapshot as "isTracked",
      poi.tracks_lots_snapshot as "tracksLots", poi.is_perishable_snapshot as "isPerishable",
      poi.subtotal_cents as "subtotalCents", poi.tax_cents as "taxCents", poi.total_cents as "totalCents",
      coalesce(array_agg(poit.tax_rate_bps_snapshot order by poit.tax_id) filter (where poit.tax_id is not null), '{}') as "taxRates"
    from purchase_order_item poi
    left join purchase_order_item_tax poit on poit.purchase_order_item_id = poi.id
    where poi.purchase_order_id = ${purchaseOrderId}
    group by poi.id order by poi.sort_order
  `);
  return new Map(
    result.rows.map((raw) => {
      const row = raw as Record<string, unknown>;
      return [
        String(row.id),
        {
          id: String(row.id),
          orderedQuantity: Number(row.orderedQuantity),
          receivedQuantity: Number(row.receivedQuantity),
          unitPriceCents: Number(row.unitPriceCents),
          contentQuantity: Number(row.contentQuantity),
          baseUnitPrecision: Number(row.baseUnitPrecision),
          inventoryItemId: row.inventoryItemId == null ? null : String(row.inventoryItemId),
          isTracked: Boolean(row.isTracked),
          tracksLots: Boolean(row.tracksLots),
          isPerishable: Boolean(row.isPerishable),
          subtotalCents: Number(row.subtotalCents),
          taxCents: Number(row.taxCents),
          totalCents: Number(row.totalCents),
          taxRates: Array.isArray(row.taxRates) ? row.taxRates.map(Number) : [],
        } satisfies ReceiptOrderLine,
      ];
    }),
  );
}

async function updateOrderStatusFromQuantities(tx: TransactionDb, purchaseOrderId: string) {
  const order = await lockOrder(tx, purchaseOrderId);
  if (["draft", "cancelled", "closed"].includes(order.status)) return;
  const result = await tx.execute(sql`
    select count(*)::int as total,
      count(*) filter (where received_presentation_quantity >= ordered_presentation_quantity)::int as complete,
      count(*) filter (where received_presentation_quantity > 0)::int as started
    from purchase_order_item where purchase_order_id = ${purchaseOrderId}
  `);
  const counts = result.rows[0] as { total: number; complete: number; started: number };
  const status: PurchaseOrderStatus =
    Number(counts.total) > 0 && Number(counts.complete) === Number(counts.total)
      ? "received"
      : Number(counts.started) > 0
        ? "partially_received"
        : "issued";
  await tx
    .update(purchaseOrdersDB)
    .set({ status, updatedAt: new Date() })
    .where(eq(purchaseOrdersDB.id, purchaseOrderId));
}

async function nextReceiptSequence(tx: TransactionDb, purchaseOrderId: string) {
  const result = await tx.execute(sql`
    select coalesce(max(sequence), 0)::int as sequence from purchase_receipt
    where purchase_order_id = ${purchaseOrderId}
  `);
  return Number((result.rows[0] as { sequence: number }).sequence) + 1;
}

async function applyReceiptTx(
  tx: TransactionDb,
  context: PurchaseOrderActorContext & { purchaseOrderId: string },
  input: PurchaseReceiptInput,
  options?: { correctsReceiptId?: string; allowClosed?: boolean },
) {
  const order = await lockOrder(tx, context.purchaseOrderId);
  const allowed = options?.allowClosed
    ? ["issued", "partially_received", "received", "closed"]
    : ["issued", "partially_received"];
  if (!allowed.includes(order.status))
    throw conflict(
      "purchaseOrder.cannotReceive",
      "Purchase order cannot receive inventory in its current status",
    );
  const location = await assertLocationAccess(tx, { ...context, locationId: order.locationId });
  if (!order.issuedAt) throw new Error("Issued purchase order has no issued timestamp");
  const today = dateInTimezone(new Date(), location.timezone);
  const issuedOn = dateInTimezone(order.issuedAt, location.timezone);
  if (input.receivedOn > today || input.receivedOn < issuedOn) {
    throw validation(
      "purchaseOrder.invalidReceiptDate",
      "Receipt date must be between issue date and today",
    );
  }
  const lines = await loadReceiptLines(tx, order.id);
  const addedByLine = new Map<string, number>();
  for (const allocation of input.allocations) {
    const line = lines.get(allocation.purchaseOrderItemId);
    if (!line)
      throw validation(
        "purchaseOrder.receiptLineNotFound",
        "Receipt line does not belong to the purchase order",
      );
    addedByLine.set(
      line.id,
      roundPurchaseQuantity((addedByLine.get(line.id) ?? 0) + allocation.presentationQuantity),
    );
  }
  for (const [lineId, quantity] of addedByLine) {
    const line = lines.get(lineId)!;
    if (line.receivedQuantity + quantity > line.orderedQuantity + EPSILON) {
      throw conflict(
        "purchaseOrder.overReceipt",
        "Received quantity exceeds the pending quantity",
        { purchaseOrderItemId: lineId },
      );
    }
  }
  const sequence = await nextReceiptSequence(tx, order.id);
  const receiptId = generateNanoId();
  const receiptFolio = `${order.folio}-R${String(sequence).padStart(2, "0")}`;
  await tx.insert(purchaseReceiptsDB).values({
    id: receiptId,
    purchaseOrderId: order.id,
    sequence,
    folio: receiptFolio,
    receivedOn: input.receivedOn,
    supplierDocumentReference: optionalText(input.supplierDocumentReference),
    observations: optionalText(input.observations),
    receivedByUserId: context.userId,
    correctsReceiptId: options?.correctsReceiptId ?? null,
  });
  const movementId = generateNanoId();
  let hasMovement = false;
  let receiptSubtotal = 0;
  let receiptTax = 0;
  const cumulativeState = new Map<
    string,
    { quantity: number; subtotal: number; tax: number; total: number }
  >();
  const currentValueResult = await tx.execute(sql`
    select pra.purchase_order_item_id as "itemId", coalesce(sum(pra.presentation_quantity), 0) as quantity,
      coalesce(sum(pra.subtotal_cents), 0)::int as subtotal, coalesce(sum(pra.tax_cents), 0)::int as tax,
      coalesce(sum(pra.total_cents), 0)::int as total
    from purchase_receipt_allocation pra inner join purchase_receipt pr on pr.id = pra.receipt_id
    where pr.purchase_order_id = ${order.id} and pr.status = 'applied'
    group by pra.purchase_order_item_id
  `);
  for (const raw of currentValueResult.rows) {
    const row = raw as {
      itemId: string;
      quantity: number | string;
      subtotal: number;
      tax: number;
      total: number;
    };
    cumulativeState.set(row.itemId, {
      quantity: Number(row.quantity),
      subtotal: Number(row.subtotal),
      tax: Number(row.tax),
      total: Number(row.total),
    });
  }
  for (const allocation of input.allocations) {
    const line = lines.get(allocation.purchaseOrderItemId)!;
    const base = calculateBaseQuantity(
      allocation.presentationQuantity,
      line.contentQuantity,
      line.baseUnitPrecision,
    );
    if (!base.respectsPrecision)
      throw validation(
        "purchaseOrder.baseUnitPrecisionExceeded",
        "Receipt quantity does not respect the base unit precision",
        { purchaseOrderItemId: line.id },
      );
    let lot: { id: string; lotCode: string | null; expiresOn: string | null } | null = null;
    if (line.isTracked && line.inventoryItemId) {
      lot = await resolveReceiptLot(tx, {
        line,
        location,
        lotCode: allocation.lotCode,
        expiresOn: allocation.expiresOn,
      });
      await tx
        .insert(inventoryLocationItemsDB)
        .values({ locationId: location.id, inventoryItemId: line.inventoryItemId })
        .onConflictDoNothing();
      if (!hasMovement) {
        await tx
          .insert(inventoryMovementsDB)
          .values({
            id: movementId,
            locationId: location.id,
            type: "purchase_receipt",
            purchaseReceiptId: receiptId,
            actorUserId: context.userId,
          });
        hasMovement = true;
      }
      const balance = await applyInventoryDelta(tx, {
        locationId: location.id,
        inventoryItemId: line.inventoryItemId,
        lotId: lot.id,
        delta: base.quantity,
      });
      await tx.insert(inventoryMovementLinesDB).values({
        id: generateNanoId(),
        movementId,
        inventoryItemId: line.inventoryItemId,
        lotId: lot.id,
        onHandDelta: base.quantity,
        reservedDelta: 0,
        onHandAfter: balance.onHandAfter,
        reservedAfter: balance.reservedAfter,
      });
    }
    const previous = cumulativeState.get(line.id) ?? { quantity: 0, subtotal: 0, tax: 0, total: 0 };
    const nextQuantity = roundPurchaseQuantity(previous.quantity + allocation.presentationQuantity);
    const calculated =
      nextQuantity >= line.orderedQuantity - EPSILON
        ? {
            subtotalCents: line.subtotalCents,
            taxCents: line.taxCents,
            totalCents: line.totalCents,
          }
        : calculatePurchaseLineTotals(nextQuantity, line.unitPriceCents, line.taxRates);
    const allocationSubtotal = calculated.subtotalCents - previous.subtotal;
    const allocationTax = calculated.taxCents - previous.tax;
    const allocationTotal = calculated.totalCents - previous.total;
    cumulativeState.set(line.id, {
      quantity: nextQuantity,
      subtotal: calculated.subtotalCents,
      tax: calculated.taxCents,
      total: calculated.totalCents,
    });
    receiptSubtotal += allocationSubtotal;
    receiptTax += allocationTax;
    await tx.insert(purchaseReceiptAllocationsDB).values({
      id: generateNanoId(),
      receiptId,
      purchaseOrderItemId: line.id,
      inventoryItemId: line.isTracked ? line.inventoryItemId : null,
      lotId: lot?.id ?? null,
      presentationQuantity: allocation.presentationQuantity,
      baseQuantity: base.quantity,
      lotCodeSnapshot: lot?.lotCode ?? null,
      expiresOnSnapshot: lot?.expiresOn ?? null,
      unitPriceCentsSnapshot: line.unitPriceCents,
      contentQuantitySnapshot: line.contentQuantity,
      baseUnitCost: line.unitPriceCents / line.contentQuantity,
      subtotalCents: allocationSubtotal,
      taxCents: allocationTax,
      totalCents: allocationTotal,
    });
  }
  for (const [lineId, quantity] of addedByLine) {
    await tx
      .update(purchaseOrderItemsDB)
      .set({
        receivedPresentationQuantity: sql`${purchaseOrderItemsDB.receivedPresentationQuantity} + ${quantity}`,
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrderItemsDB.id, lineId));
  }
  await tx
    .update(purchaseReceiptsDB)
    .set({
      inventoryMovementId: hasMovement ? movementId : null,
      subtotalCents: receiptSubtotal,
      taxCents: receiptTax,
      totalCents: receiptSubtotal + receiptTax,
      updatedAt: new Date(),
    })
    .where(eq(purchaseReceiptsDB.id, receiptId));
  await updateOrderStatusFromQuantities(tx, order.id);
  await addEvent(tx, {
    purchaseOrderId: order.id,
    actorUserId: context.userId,
    type: "receipt_applied",
    metadata: { receiptId, folio: receiptFolio },
  });
  return receiptId;
}

async function reverseReceiptTx(
  tx: TransactionDb,
  context: PurchaseOrderActorContext & { purchaseOrderId: string; receiptId: string },
  reason: string,
) {
  const order = await lockOrder(tx, context.purchaseOrderId);
  await assertLocationAccess(tx, { ...context, locationId: order.locationId });
  const receiptResult = await tx.execute(sql`
    select id, status from purchase_receipt where id = ${context.receiptId}
      and purchase_order_id = ${order.id} for update
  `);
  const receipt = receiptResult.rows[0] as
    | { id: string; status: "applied" | "reversed" }
    | undefined;
  if (!receipt) throw notFound("purchaseOrder.receiptNotFound", "Purchase receipt was not found");
  if (receipt.status !== "applied")
    throw conflict("purchaseOrder.receiptAlreadyReversed", "Purchase receipt is already reversed");
  const allocationsResult = await tx.execute(sql`
    select id, purchase_order_item_id as "itemId", inventory_item_id as "inventoryItemId",
      lot_id as "lotId", presentation_quantity as "presentationQuantity", base_quantity as "baseQuantity"
    from purchase_receipt_allocation where receipt_id = ${receipt.id} for update
  `);
  const movementId = generateNanoId();
  let hasMovement = false;
  for (const raw of allocationsResult.rows) {
    const row = raw as {
      itemId: string;
      inventoryItemId: string | null;
      lotId: string | null;
      presentationQuantity: number | string;
      baseQuantity: number | string;
    };
    if (row.inventoryItemId && row.lotId) {
      if (!hasMovement) {
        await tx
          .insert(inventoryMovementsDB)
          .values({
            id: movementId,
            locationId: order.locationId,
            type: "purchase_receipt_reversal",
            purchaseReceiptId: receipt.id,
            actorUserId: context.userId,
          });
        hasMovement = true;
      }
      const quantity = Number(row.baseQuantity);
      const balance = await applyInventoryDelta(tx, {
        locationId: order.locationId,
        inventoryItemId: row.inventoryItemId,
        lotId: row.lotId,
        delta: -quantity,
      });
      await tx
        .insert(inventoryMovementLinesDB)
        .values({
          id: generateNanoId(),
          movementId,
          inventoryItemId: row.inventoryItemId,
          lotId: row.lotId,
          onHandDelta: -quantity,
          reservedDelta: 0,
          onHandAfter: balance.onHandAfter,
          reservedAfter: balance.reservedAfter,
        });
    }
    await tx
      .update(purchaseOrderItemsDB)
      .set({
        receivedPresentationQuantity: sql`${purchaseOrderItemsDB.receivedPresentationQuantity} - ${Number(row.presentationQuantity)}`,
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrderItemsDB.id, row.itemId));
  }
  await tx
    .update(purchaseReceiptsDB)
    .set({
      status: "reversed",
      reversedAt: new Date(),
      reversedByUserId: context.userId,
      reversalReason: optionalText(reason),
      reversalInventoryMovementId: hasMovement ? movementId : null,
      updatedAt: new Date(),
    })
    .where(eq(purchaseReceiptsDB.id, receipt.id));
  await updateOrderStatusFromQuantities(tx, order.id);
  await addEvent(tx, {
    purchaseOrderId: order.id,
    actorUserId: context.userId,
    type: "receipt_reversed",
    metadata: { receiptId: receipt.id, reason },
  });
}

export function adminPurchaseOrdersService(fastify: FastifyInstance): AdminPurchaseOrdersService {
  return {
    async options(context) {
      const owner = await isGlobalOwner(fastify.db, context.userId);
      const [locationsResult, suppliers, taxes] = await Promise.all([
        fastify.db.execute(sql`
          select distinct l.id, l.name, l.type, l.timezone
          from inventory_location l left join inventory_location_access a
            on a.location_id = l.id and a.user_id = ${context.userId}
          where l.deleted_at is null and (${owner} or l.organization_id = ${context.organizationId} or a.user_id is not null)
          order by l.type, l.name
        `),
        fastify.db
          .select({ id: suppliersDB.id, name: suppliersDB.name })
          .from(suppliersDB)
          .where(isNull(suppliersDB.deletedAt))
          .orderBy(suppliersDB.name),
        fastify.db
          .select({ id: taxDB.id, name: taxDB.name, rate: taxDB.rate })
          .from(taxDB)
          .orderBy(taxDB.name),
      ]);
      return {
        locations: locationsResult.rows.map((raw) => {
          const row = raw as {
            id: string;
            name: string;
            type: "branch" | "distribution_center";
            timezone: string;
          };
          return row;
        }),
        suppliers,
        taxes,
      };
    },

    async catalog(context) {
      await syncPurchasableInventoryItems(fastify.db);
      const [supplier] = await fastify.db
        .select({ id: suppliersDB.id })
        .from(suppliersDB)
        .where(and(eq(suppliersDB.id, context.supplierId), isNull(suppliersDB.deletedAt)))
        .limit(1);
      if (!supplier) throw notFound("purchaseOrder.supplierNotFound", "Supplier was not found");
      const result = await fastify.db.execute(sql`
        select p.id as "presentationId", si.id as "supplierItemId",
          case when si.ingredient_id is not null then 'ingredient' else 'supply' end as "itemType",
          coalesce(si.ingredient_id, si.supply_id) as "itemId", coalesce(i.name, s.name) as "itemName",
          p.name as "presentationName", p.content_quantity as "contentQuantity", p.is_default as "isDefault",
          c.price_cents as "referencePriceCents", ii.id as "inventoryItemId", coalesce(ii.is_tracked, false) as "isTracked",
          coalesce(ii.tracks_lots, false) as "tracksLots", coalesce(ii.is_perishable, false) as "isPerishable",
          u.id as "unitId", u.name as "unitName", u.abbreviation as "unitAbbreviation", u.precision as "unitPrecision",
          coalesce(array_agg(distinct coalesce(it.tax_id, st.tax_id)) filter (where coalesce(it.tax_id, st.tax_id) is not null), '{}') as "defaultTaxIds"
        from supplier_item si inner join supplier_item_presentation p on p.supplier_item_id = si.id
        left join ingredient i on i.id = si.ingredient_id left join supply s on s.id = si.supply_id
        inner join unit u on u.id = coalesce(i.base_unit_id, s.base_unit_id)
        left join inventory_item ii on ii.ingredient_id = si.ingredient_id or ii.supply_id = si.supply_id
        left join supplier_presentation_cost c on c.presentation_id = p.id and c.effective_to is null
        left join ingredient_tax it on it.ingredient_id = si.ingredient_id
        left join supply_tax st on st.supply_id = si.supply_id
        where si.supplier_id = ${context.supplierId} and si.deleted_at is null and p.deleted_at is null
          and coalesce(i.deleted_at, s.deleted_at) is null
        group by p.id, si.id, i.id, s.id, u.id, ii.id, c.id
        order by coalesce(i.name, s.name), p.is_default desc, p.name
      `);
      return result.rows.map((raw) => {
        const row = raw as Record<string, unknown>;
        return {
          id: String(row.presentationId),
          supplierItemId: String(row.supplierItemId),
          itemType: row.itemType as "ingredient" | "supply",
          itemId: String(row.itemId),
          itemName: String(row.itemName),
          presentationName: String(row.presentationName),
          contentQuantity: Number(row.contentQuantity),
          referencePriceCents:
            row.referencePriceCents == null ? null : Number(row.referencePriceCents),
          isDefault: Boolean(row.isDefault),
          inventory: {
            itemId: row.inventoryItemId == null ? null : String(row.inventoryItemId),
            isTracked: Boolean(row.isTracked),
            tracksLots: Boolean(row.tracksLots),
            isPerishable: Boolean(row.isPerishable),
          },
          baseUnit: {
            id: String(row.unitId),
            name: String(row.unitName),
            abbreviation: String(row.unitAbbreviation),
            precision: Number(row.unitPrecision),
          },
          defaultTaxIds: Array.isArray(row.defaultTaxIds) ? row.defaultTaxIds.map(String) : [],
        } satisfies PurchaseOrderCatalogPresentation;
      });
    },

    async list(context) {
      const owner = await isGlobalOwner(fastify.db, context.userId);
      const conditions = [
        sql`(${owner} or l.organization_id = ${context.organizationId} or a.user_id is not null)`,
      ];
      if (context.search)
        conditions.push(
          sql`(po.folio ilike ${`%${context.search}%`} or po.supplier_name_snapshot ilike ${`%${context.search}%`} or po.quote_reference ilike ${`%${context.search}%`})`,
        );
      if (context.status && context.status !== "all")
        conditions.push(sql`po.status = ${context.status}`);
      if (context.supplierId) conditions.push(sql`po.supplier_id = ${context.supplierId}`);
      if (context.locationId) conditions.push(sql`po.location_id = ${context.locationId}`);
      if (context.dateFrom) conditions.push(sql`po.created_at >= ${context.dateFrom}::date`);
      if (context.dateTo)
        conditions.push(sql`po.created_at < (${context.dateTo}::date + interval '1 day')`);
      const where = sql.join(conditions, sql` and `);
      const page = context.page ?? 1;
      const pageSize = context.pageSize ?? 20;
      const [rowsResult, countResult] = await Promise.all([
        fastify.db.execute(sql`
          select po.id from purchase_order po inner join inventory_location l on l.id = po.location_id
          left join inventory_location_access a on a.location_id = l.id and a.user_id = ${context.userId}
          where ${where} order by po.created_at desc, po.id desc limit ${pageSize} offset ${(page - 1) * pageSize}
        `),
        fastify.db.execute(sql`
          select count(distinct po.id)::int as count from purchase_order po inner join inventory_location l on l.id = po.location_id
          left join inventory_location_access a on a.location_id = l.id and a.user_id = ${context.userId} where ${where}
        `),
      ]);
      const data = await Promise.all(
        (rowsResult.rows as Array<{ id: string }>).map(async ({ id }) => {
          const [header, lines] = await Promise.all([
            readHeader(fastify.db, id),
            readLines(fastify.db, id),
          ]);
          return listItemFromDetail(header, lines);
        }),
      );
      const totalItems = Number((countResult.rows[0] as { count: number }).count);
      return {
        data,
        pagination: {
          page,
          pageSize,
          totalItems,
          totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
        },
      };
    },

    get(context) {
      return getDetail(fastify.db, context);
    },

    async create(context) {
      const id = await fastify.db.transaction((tx) => createDraftTx(tx, context, context));
      return getDetail(fastify.db, { ...context, purchaseOrderId: id });
    },

    async updateDraft(context) {
      await fastify.db.transaction(async (tx) => {
        const order = await lockOrder(tx, context.purchaseOrderId);
        if (order.status !== "draft")
          throw conflict("purchaseOrder.notDraft", "Only draft purchase orders can be edited");
        const [supplier] = await tx
          .select({ id: suppliersDB.id, name: suppliersDB.name })
          .from(suppliersDB)
          .where(and(eq(suppliersDB.id, context.supplierId), isNull(suppliersDB.deletedAt)))
          .limit(1);
        if (!supplier)
          throw validation("purchaseOrder.supplierUnavailable", "Supplier is not active");
        const location = await assertLocationAccess(tx, {
          ...context,
          locationId: context.locationId,
        });
        const observations = optionalText(context.observations);
        await tx
          .update(purchaseOrdersDB)
          .set({
            supplierId: supplier.id,
            locationId: location.id,
            supplierNameSnapshot: supplier.name,
            locationNameSnapshot: location.name,
            locationTimezoneSnapshot: location.timezone,
            quoteReference: optionalText(context.quoteReference),
            observations,
            expectedDeliveryOn: context.expectedDeliveryOn ?? null,
            updatedAt: new Date(),
          })
          .where(eq(purchaseOrdersDB.id, order.id));
        await replaceDraftLines(tx, {
          purchaseOrderId: order.id,
          supplierId: supplier.id,
          observations,
          lines: context.lines,
        });
        await addEvent(tx, {
          purchaseOrderId: order.id,
          actorUserId: context.userId,
          type: "updated",
        });
      });
      return getDetail(fastify.db, context);
    },

    async deleteDraft(context) {
      await fastify.db.transaction(async (tx) => {
        const order = await lockOrder(tx, context.purchaseOrderId);
        await assertLocationAccess(tx, { ...context, locationId: order.locationId });
        if (order.status !== "draft")
          throw conflict("purchaseOrder.notDraft", "Only draft purchase orders can be deleted");
        await tx.delete(purchaseOrdersDB).where(eq(purchaseOrdersDB.id, order.id));
      });
    },

    async issue(context) {
      await fastify.db.transaction(async (tx) => {
        const order = await lockOrder(tx, context.purchaseOrderId);
        await assertLocationAccess(tx, { ...context, locationId: order.locationId });
        if (order.status !== "draft")
          throw conflict("purchaseOrder.notDraft", "Only a draft can be issued");
        const lineResult = await tx.execute(sql`
          select presentation_id as "presentationId", ordered_presentation_quantity as quantity,
            unit_price_cents as "unitPriceCents" from purchase_order_item where purchase_order_id = ${order.id} order by sort_order
        `);
        if (lineResult.rows.length === 0)
          throw validation(
            "purchaseOrder.linesRequired",
            "At least one line is required to issue the purchase order",
          );
        const taxResult = await tx.execute(sql`
          select poit.purchase_order_item_id as "itemId", poit.tax_id as "taxId"
          from purchase_order_item_tax poit inner join purchase_order_item poi on poi.id = poit.purchase_order_item_id
          where poi.purchase_order_id = ${order.id}
        `);
        const itemIdsResult = await tx.execute(
          sql`select id from purchase_order_item where purchase_order_id = ${order.id} order by sort_order`,
        );
        const taxByItem = new Map<string, string[]>();
        for (const raw of taxResult.rows) {
          const row = raw as { itemId: string; taxId: string };
          const ids = taxByItem.get(row.itemId) ?? [];
          ids.push(row.taxId);
          taxByItem.set(row.itemId, ids);
        }
        const inputs = lineResult.rows.map((raw, index) => {
          const row = raw as {
            presentationId: string;
            quantity: number | string;
            unitPriceCents: number;
          };
          const itemId = String((itemIdsResult.rows[index] as { id: string }).id);
          return {
            presentationId: row.presentationId,
            quantity: Number(row.quantity),
            unitPriceCents: Number(row.unitPriceCents),
            taxIds: taxByItem.get(itemId) ?? [],
          };
        });
        await replaceDraftLines(tx, {
          purchaseOrderId: order.id,
          supplierId: order.supplierId,
          observations: order.observations,
          lines: inputs,
        });
        await tx
          .update(purchaseOrdersDB)
          .set({
            status: "issued",
            issuedAt: new Date(),
            issuedByUserId: context.userId,
            updatedAt: new Date(),
          })
          .where(eq(purchaseOrdersDB.id, order.id));
        await addEvent(tx, {
          purchaseOrderId: order.id,
          actorUserId: context.userId,
          type: "issued",
        });
      });
      return getDetail(fastify.db, context);
    },

    async updateMetadata(context) {
      await fastify.db.transaction(async (tx) => {
        const order = await lockOrder(tx, context.purchaseOrderId);
        await assertLocationAccess(tx, { ...context, locationId: order.locationId });
        if (!["issued", "partially_received"].includes(order.status))
          throw conflict(
            "purchaseOrder.metadataLocked",
            "Purchase order metadata can no longer be changed",
          );
        const beforeResult = await tx.execute(
          sql`select expected_delivery_on as "expectedDeliveryOn", observations from purchase_order where id = ${order.id}`,
        );
        const before = beforeResult.rows[0] as {
          expectedDeliveryOn: string | null;
          observations: string | null;
        };
        const values: {
          expectedDeliveryOn?: string | null;
          observations?: string | null;
          updatedAt: Date;
        } = { updatedAt: new Date() };
        if (context.expectedDeliveryOn !== undefined)
          values.expectedDeliveryOn = context.expectedDeliveryOn;
        if (context.observations !== undefined)
          values.observations = optionalText(context.observations);
        await tx.update(purchaseOrdersDB).set(values).where(eq(purchaseOrdersDB.id, order.id));
        await addEvent(tx, {
          purchaseOrderId: order.id,
          actorUserId: context.userId,
          type: "metadata_updated",
          metadata: {
            before,
            after: {
              expectedDeliveryOn: values.expectedDeliveryOn ?? before.expectedDeliveryOn,
              observations: values.observations ?? before.observations,
            },
          },
        });
      });
      return getDetail(fastify.db, context);
    },

    async cancel(context) {
      await fastify.db.transaction(async (tx) => {
        const order = await lockOrder(tx, context.purchaseOrderId);
        await assertLocationAccess(tx, { ...context, locationId: order.locationId });
        if (order.status !== "issued")
          throw conflict(
            "purchaseOrder.cannotCancel",
            "Only an issued order without receipts can be cancelled",
          );
        const receiptResult = await tx.execute(
          sql`select count(*)::int as count from purchase_receipt where purchase_order_id = ${order.id} and status = 'applied'`,
        );
        if (Number((receiptResult.rows[0] as { count: number }).count) > 0)
          throw conflict(
            "purchaseOrder.hasReceipts",
            "Purchase order with receipts cannot be cancelled",
          );
        await tx
          .update(purchaseOrdersDB)
          .set({
            status: "cancelled",
            cancelledAt: new Date(),
            cancelledByUserId: context.userId,
            cancellationReason: optionalText(context.reason),
            updatedAt: new Date(),
          })
          .where(eq(purchaseOrdersDB.id, order.id));
        await addEvent(tx, {
          purchaseOrderId: order.id,
          actorUserId: context.userId,
          type: "cancelled",
          metadata: { reason: context.reason },
        });
      });
      return getDetail(fastify.db, context);
    },

    async close(context) {
      await fastify.db.transaction(async (tx) => {
        const order = await lockOrder(tx, context.purchaseOrderId);
        await assertLocationAccess(tx, { ...context, locationId: order.locationId });
        if (order.status !== "partially_received")
          throw conflict(
            "purchaseOrder.cannotClose",
            "Only a partially received order can close its pending balance",
          );
        await tx
          .update(purchaseOrdersDB)
          .set({
            status: "closed",
            closedAt: new Date(),
            closedByUserId: context.userId,
            closeReason: optionalText(context.reason),
            updatedAt: new Date(),
          })
          .where(eq(purchaseOrdersDB.id, order.id));
        await addEvent(tx, {
          purchaseOrderId: order.id,
          actorUserId: context.userId,
          type: "closed",
          metadata: { reason: context.reason },
        });
      });
      return getDetail(fastify.db, context);
    },

    async duplicate(context) {
      await assertOrderAccess(fastify.db, context);
      const detail = await getDetail(fastify.db, context);
      const id = await fastify.db.transaction((tx) =>
        createDraftTx(
          tx,
          context,
          {
            supplierId: detail.supplier.id,
            locationId: detail.location.id,
            quoteReference: null,
            observations: null,
            expectedDeliveryOn: null,
            lines: detail.lines.map((line) => ({
              presentationId: line.presentationId,
              quantity: line.orderedQuantity,
              unitPriceCents: line.unitPriceCents,
              taxIds: line.taxes.map((tax) => tax.id),
            })),
          },
          detail.id,
        ),
      );
      return getDetail(fastify.db, { ...context, purchaseOrderId: id });
    },

    async receive(context) {
      await fastify.db.transaction((tx) => applyReceiptTx(tx, context, context));
      return getDetail(fastify.db, context);
    },

    async reverseReceipt(context) {
      await fastify.db.transaction((tx) => reverseReceiptTx(tx, context, context.reason));
      return getDetail(fastify.db, context);
    },

    async correctReceipt(context) {
      await fastify.db.transaction(async (tx) => {
        await reverseReceiptTx(tx, context, context.reason);
        const replacementId = await applyReceiptTx(tx, context, context, {
          correctsReceiptId: context.receiptId,
          allowClosed: true,
        });
        await tx
          .update(purchaseReceiptsDB)
          .set({ replacementReceiptId: replacementId, updatedAt: new Date() })
          .where(eq(purchaseReceiptsDB.id, context.receiptId));
        await addEvent(tx, {
          purchaseOrderId: context.purchaseOrderId,
          actorUserId: context.userId,
          type: "receipt_corrected",
          metadata: { originalReceiptId: context.receiptId, replacementReceiptId: replacementId },
        });
      });
      return getDetail(fastify.db, context);
    },
  };
}
