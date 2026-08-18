import {
  inventoryBalancesDB,
  inventoryMovementLinesDB,
  inventoryMovementsDB,
  inventoryReservationAllocationsDB,
  inventoryReservationsDB,
} from "@core/db/schemas";
import type {
  workOrdersDB,
  WorkOrderInventoryRequirementSnapshot,
} from "@core/db/schemas";
import { conflict, generateNanoId } from "@core/utils";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { PreparedOrderPayload } from "../orders/orders.validators";

type TransactionDb = Parameters<Parameters<FastifyInstance["db"]["transaction"]>[0]>[0];
type WorkOrderInsert = typeof workOrdersDB.$inferInsert;

interface WorkUnitSpec {
  workOrderId: string;
  productId: string;
  variationId: string | null;
  multiplier: number;
  modifierOptions: Array<{ modifierOptionId: string; quantity: number }>;
}

interface RequirementRow {
  sourceId: string;
  inventoryItemId: string;
  quantity: number;
}

export interface PreparedOrderInventoryPlan {
  enforced: boolean;
  locationId: string | null;
  timezone: string | null;
  workOrders: WorkOrderInsert[];
  requirements: WorkOrderInventoryRequirementSnapshot[];
}

export type InventoryAvailabilityReason = "available" | "sold_out" | "manual_override";

export interface InventoryAvailability {
  isAvailable: boolean;
  reason: InventoryAvailabilityReason;
  maxProducible: number | null;
}

export interface InventoryAvailabilitySnapshot {
  enforced: boolean;
  product(productId: string): InventoryAvailability;
  variation(productId: string, variationId: string): InventoryAvailability;
  modifierOption(modifierOptionId: string): InventoryAvailability;
}

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function localDate(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function syncInventoryItems(tx: TransactionDb) {
  await tx.execute(sql`
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
  await tx.execute(sql`
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
  await tx.execute(sql`
    insert into inventory_item (id, kind, product_id, base_unit_id, is_tracked)
    select 'inv_prd_' || p.id, 'product', p.id, p.unit_id,
      p.inventory_tracking_mode = 'finished_good'
        and not exists (select 1 from variation v where v.product_id = p.id and v.deleted_at is null)
    from product p
    on conflict (product_id) where product_id is not null do update set
      base_unit_id = excluded.base_unit_id,
      is_tracked = excluded.is_tracked,
      updated_at = now()
  `);
  await tx.execute(sql`
    insert into inventory_item (id, kind, variation_id, base_unit_id, is_tracked)
    select 'inv_var_' || v.id, 'variation', v.id, p.unit_id,
      p.inventory_tracking_mode = 'finished_good'
    from variation v
    inner join product p on p.id = v.product_id
    on conflict (variation_id) where variation_id is not null do update set
      base_unit_id = excluded.base_unit_id,
      is_tracked = excluded.is_tracked,
      updated_at = now()
  `);
}

function buildWorkUnitSpecs(payload: PreparedOrderPayload, workOrders: WorkOrderInsert[]) {
  const workOrdersByItem = new Map<string, WorkOrderInsert[]>();
  for (const workOrder of workOrders) {
    const rows = workOrdersByItem.get(workOrder.orderItemId) ?? [];
    rows.push(workOrder);
    workOrdersByItem.set(workOrder.orderItemId, rows);
  }

  const specs: WorkUnitSpec[] = [];
  for (const preparedItem of payload.items) {
    const orderItemId = preparedItem.item.id ?? "";
    const itemWorkOrders = workOrdersByItem.get(orderItemId) ?? [];
    let workOrderIndex = 0;

    if (preparedItem.compoundComponents.length > 0) {
      const quantity = Number(preparedItem.item.quantity ?? 0);
      const unitCount = Number.isInteger(quantity) ? Math.max(1, Math.trunc(quantity)) : 1;
      const quantitySnapshot = Number.isInteger(quantity) ? 1 : quantity;

      for (const component of preparedItem.compoundComponents) {
        const componentUnits = Math.max(1, Number(component.quantity ?? 1));
        for (let index = 0; index < unitCount * componentUnits; index += 1) {
          const workOrder = itemWorkOrders[workOrderIndex];
          workOrderIndex += 1;
          if (!workOrder) continue;
          specs.push({
            workOrderId: workOrder.id,
            productId: component.componentProductId,
            variationId: component.variationId ?? null,
            multiplier: quantitySnapshot,
            modifierOptions: (component.modifiersSnapshot ?? []).map((modifier) => ({
              modifierOptionId: modifier.modifierOptionId,
              quantity: modifier.quantity,
            })),
          });
        }
      }
      continue;
    }

    for (const workOrder of itemWorkOrders) {
      specs.push({
        workOrderId: workOrder.id,
        productId: preparedItem.item.productId,
        variationId: preparedItem.item.variationId ?? null,
        multiplier: Number(workOrder.quantitySnapshot),
        modifierOptions: preparedItem.modifiers.map((modifier) => ({
          modifierOptionId: modifier.modifierOptionId,
          quantity: Number(modifier.quantity ?? 1),
        })),
      });
    }
  }

  return specs;
}

async function loadRequirementContext(tx: TransactionDb) {
  const [productResult, productRecipeResult, variationRecipeResult, modifierRecipeResult] =
    await Promise.all([
      tx.execute(sql`
        select id, inventory_tracking_mode as "trackingMode"
        from product
        where deleted_at is null
      `),
      tx.execute(sql`
        select r.product_id as "sourceId", ii.id as "inventoryItemId", ri.quantity
        from recipe_ingredient ri
        inner join recipe r on r.product_id = ri.recipe_id
        inner join inventory_item ii on ii.ingredient_id = ri.ingredient_id and ii.is_tracked = true
        union all
        select r.product_id as "sourceId", ii.id as "inventoryItemId", rs.quantity
        from recipe_supply rs
        inner join recipe r on r.product_id = rs.recipe_id
        inner join inventory_item ii on ii.supply_id = rs.supply_id and ii.is_tracked = true
      `),
      tx.execute(sql`
        select vr.variation_id as "sourceId", ii.id as "inventoryItemId", vri.quantity
        from variation_recipe_ingredient vri
        inner join variation_recipe vr on vr.variation_id = vri.variation_id
        inner join inventory_item ii on ii.ingredient_id = vri.ingredient_id and ii.is_tracked = true
        union all
        select vr.variation_id as "sourceId", ii.id as "inventoryItemId", vrs.quantity
        from variation_recipe_supply vrs
        inner join variation_recipe vr on vr.variation_id = vrs.variation_id
        inner join inventory_item ii on ii.supply_id = vrs.supply_id and ii.is_tracked = true
      `),
      tx.execute(sql`
        select moi.modifier_option_id as "sourceId", ii.id as "inventoryItemId", moi.quantity
        from modifier_option_ingredient moi
        inner join inventory_item ii on ii.ingredient_id = moi.ingredient_id and ii.is_tracked = true
        union all
        select mos.modifier_option_id as "sourceId", ii.id as "inventoryItemId", mos.quantity
        from modifier_option_supply mos
        inner join inventory_item ii on ii.supply_id = mos.supply_id and ii.is_tracked = true
      `),
    ]);

  const products = new Map(
    (productResult.rows as Array<{ id: string; trackingMode: string }>).map((row) => [row.id, row]),
  );
  const productItemsResult = await tx.execute(sql`
    select product_id as "sourceId", id as "inventoryItemId"
    from inventory_item
    where product_id is not null and is_tracked = true
    union all
    select variation_id as "sourceId", id as "inventoryItemId"
    from inventory_item
    where variation_id is not null and is_tracked = true
  `);
  const finishedItems = new Map(
    (
      productItemsResult.rows as Array<{ sourceId: string; inventoryItemId: string }>
    ).map((row) => [row.sourceId, row.inventoryItemId]),
  );

  const groupRows = (rows: readonly Record<string, unknown>[]) => {
    const grouped = new Map<string, RequirementRow[]>();
    for (const raw of rows) {
      const row = raw as unknown as RequirementRow;
      const current = grouped.get(row.sourceId) ?? [];
      current.push({ ...row, quantity: Number(row.quantity) });
      grouped.set(row.sourceId, current);
    }
    return grouped;
  };

  return {
    products,
    finishedItems,
    productRecipes: groupRows(productRecipeResult.rows),
    variationRecipes: groupRows(variationRecipeResult.rows),
    modifierRecipes: groupRows(modifierRecipeResult.rows),
  };
}

function resolveWorkUnitRequirements(
  spec: WorkUnitSpec,
  context: Awaited<ReturnType<typeof loadRequirementContext>>,
) {
  const requirements = new Map<string, number>();
  const add = (inventoryItemId: string, quantity: number) => {
    requirements.set(
      inventoryItemId,
      roundQuantity((requirements.get(inventoryItemId) ?? 0) + quantity),
    );
  };
  const product = context.products.get(spec.productId);

  if (product?.trackingMode === "finished_good") {
    const inventoryItemId = context.finishedItems.get(spec.variationId ?? spec.productId);
    if (inventoryItemId) add(inventoryItemId, spec.multiplier);
  } else if (product?.trackingMode === "recipe") {
    const recipe = spec.variationId
      ? context.variationRecipes.get(spec.variationId)
      : context.productRecipes.get(spec.productId);
    for (const row of recipe ?? []) {
      add(row.inventoryItemId, row.quantity * spec.multiplier);
    }
  }

  for (const modifier of spec.modifierOptions) {
    for (const row of context.modifierRecipes.get(modifier.modifierOptionId) ?? []) {
      add(row.inventoryItemId, row.quantity * modifier.quantity * spec.multiplier);
    }
  }

  return [...requirements.entries()]
    .map(([inventoryItemId, quantity]) => ({ inventoryItemId, quantity }))
    .sort((left, right) => left.inventoryItemId.localeCompare(right.inventoryItemId));
}

export function resolveInventoryRequirementsAvailability(
  requirements: WorkOrderInventoryRequirementSnapshot[],
  availableByItem: ReadonlyMap<string, number>,
): InventoryAvailability {
  if (requirements.length === 0) {
    return { isAvailable: true, reason: "available", maxProducible: null };
  }
  const maxProducible = Math.max(
    0,
    Math.min(
      ...requirements.map((requirement) =>
        Math.floor(
          ((availableByItem.get(requirement.inventoryItemId) ?? 0) + 0.0000001) /
            requirement.quantity,
        ),
      ),
    ),
  );
  return {
    isAvailable: maxProducible > 0,
    reason: maxProducible > 0 ? "available" : "sold_out",
    maxProducible,
  };
}

export async function createInventoryAvailabilitySnapshot(
  fastify: FastifyInstance,
  input: { organizationId: string; scheduledFor?: Date | null },
): Promise<InventoryAvailabilitySnapshot> {
  return fastify.db.transaction(async (tx) => {
    await syncInventoryItems(tx);
    await releaseExpiredCheckoutInventory(tx);

    const locationResult = await tx.execute(sql`
      select id, timezone, sales_enforcement_enabled as "salesEnforcementEnabled"
      from inventory_location
      where organization_id = ${input.organizationId}
        and type = 'branch'
        and is_default_sales_location = true
        and deleted_at is null
      limit 1
    `);
    const location = locationResult.rows[0] as
      | { id: string; timezone: string; salesEnforcementEnabled: boolean }
      | undefined;
    if (!location) {
      const available = () => ({
        isAvailable: true,
        reason: "available" as const,
        maxProducible: null,
      });
      return {
        enforced: false,
        product: available,
        variation: available,
        modifierOption: available,
      };
    }

    const eligibleDate = localDate(input.scheduledFor ?? new Date(), location.timezone);
    const [context, balancesResult, overridesResult, variationsResult, compoundSlotsResult] =
      await Promise.all([
        loadRequirementContext(tx),
        tx.execute(sql`
          select b.inventory_item_id as "inventoryItemId",
            coalesce(sum(greatest(b.on_hand_quantity - b.reserved_quantity, 0)), 0) as available
          from inventory_balance b
          inner join inventory_lot l on l.id = b.lot_id
          where b.location_id = ${location.id}
            and (l.expires_on is null or l.expires_on >= ${eligibleDate}::date)
          group by b.inventory_item_id
        `),
        tx.execute(sql`
          select target_type as "targetType", product_id as "productId",
            variation_id as "variationId", modifier_option_id as "modifierOptionId"
          from inventory_availability_override
          where location_id = ${location.id}
            and cleared_at is null
            and starts_at <= now()
            and (ends_at is null or ends_at > now())
        `),
        tx.execute(sql`
          select id, product_id as "productId"
          from variation
          where deleted_at is null
          order by sort_order, id
        `),
        tx.execute(sql`
          select s.compound_product_id as "compoundProductId", s.id as "slotId",
            s.quantity, o.component_product_id as "componentProductId"
          from product_compound_slot s
          inner join product_compound_slot_option o on o.slot_id = s.id
          union all
          select c.compound_product_id as "compoundProductId",
            c.compound_product_id || ':' || c.sort_order::text as "slotId",
            c.quantity, c.component_product_id as "componentProductId"
          from product_compound_component c
          where not exists (
            select 1 from product_compound_slot s
            where s.compound_product_id = c.compound_product_id
          )
        `),
      ]);

    const availableByItem = new Map(
      (balancesResult.rows as Array<{ inventoryItemId: string; available: string | number }>).map(
        (row) => [row.inventoryItemId, Number(row.available)],
      ),
    );
    const productOverrides = new Set<string>();
    const variationOverrides = new Set<string>();
    const modifierOptionOverrides = new Set<string>();
    for (const raw of overridesResult.rows) {
      const row = raw as {
        targetType: string;
        productId: string | null;
        variationId: string | null;
        modifierOptionId: string | null;
      };
      if (row.targetType === "product" && row.productId) productOverrides.add(row.productId);
      if (row.targetType === "variation" && row.variationId) {
        variationOverrides.add(row.variationId);
      }
      if (row.targetType === "modifier_option" && row.modifierOptionId) {
        modifierOptionOverrides.add(row.modifierOptionId);
      }
    }
    const variationIdsByProduct = new Map<string, string[]>();
    for (const raw of variationsResult.rows) {
      const row = raw as { id: string; productId: string };
      const rows = variationIdsByProduct.get(row.productId) ?? [];
      rows.push(row.id);
      variationIdsByProduct.set(row.productId, rows);
    }
    const compoundSlots = new Map<
      string,
      Map<string, { quantity: number; componentProductIds: string[] }>
    >();
    for (const raw of compoundSlotsResult.rows) {
      const row = raw as {
        compoundProductId: string;
        slotId: string;
        quantity: string | number;
        componentProductId: string;
      };
      const slots = compoundSlots.get(row.compoundProductId) ?? new Map();
      const slot = slots.get(row.slotId) ?? {
        quantity: Number(row.quantity),
        componentProductIds: [],
      };
      slot.componentProductIds.push(row.componentProductId);
      slots.set(row.slotId, slot);
      compoundSlots.set(row.compoundProductId, slots);
    }

    const manual = (): InventoryAvailability => ({
      isAvailable: false,
      reason: "manual_override",
      maxProducible: 0,
    });
    const unlimited = (): InventoryAvailability => ({
      isAvailable: true,
      reason: "available",
      maxProducible: null,
    });
    const variation = (productId: string, variationId: string) => {
      if (productOverrides.has(productId) || variationOverrides.has(variationId)) return manual();
      if (!location.salesEnforcementEnabled) return unlimited();
      return resolveInventoryRequirementsAvailability(
        resolveWorkUnitRequirements(
          { workOrderId: "availability", productId, variationId, multiplier: 1, modifierOptions: [] },
          context,
        ),
        availableByItem,
      );
    };
    const productCache = new Map<string, InventoryAvailability>();
    const product = (productId: string, visiting = new Set<string>()): InventoryAvailability => {
      if (productOverrides.has(productId)) return manual();
      if (!location.salesEnforcementEnabled) return unlimited();
      const cached = productCache.get(productId);
      if (cached) return cached;
      if (visiting.has(productId)) {
        return { isAvailable: false, reason: "sold_out", maxProducible: 0 };
      }
      const nextVisiting = new Set(visiting).add(productId);
      const slots = compoundSlots.get(productId);
      if (slots && slots.size > 0) {
        const slotAvailability = [...slots.values()].map((slot) => {
          const options = slot.componentProductIds.map((id) => product(id, nextVisiting));
          const max = Math.max(
            0,
            ...options.map((option) =>
              option.maxProducible === null
                ? Number.POSITIVE_INFINITY
                : Math.floor(option.maxProducible / slot.quantity),
            ),
          );
          return max;
        });
        const max = Math.min(...slotAvailability);
        const resolved = {
          isAvailable: max > 0,
          reason: (max > 0 ? "available" : "sold_out") as InventoryAvailabilityReason,
          maxProducible: Number.isFinite(max) ? max : null,
        };
        productCache.set(productId, resolved);
        return resolved;
      }
      const variationIds = variationIdsByProduct.get(productId) ?? [];
      if (variationIds.length > 0) {
        const options = variationIds.map((variationId) => variation(productId, variationId));
        const availableOptions = options.filter((option) => option.isAvailable);
        const finite = availableOptions
          .map((option) => option.maxProducible)
          .filter((value): value is number => value !== null);
        const resolved: InventoryAvailability = {
          isAvailable: availableOptions.length > 0,
          reason: availableOptions.length > 0 ? "available" : "sold_out",
          maxProducible:
            availableOptions.some((option) => option.maxProducible === null)
              ? null
              : Math.max(0, ...finite),
        };
        productCache.set(productId, resolved);
        return resolved;
      }
      const resolved = resolveInventoryRequirementsAvailability(
        resolveWorkUnitRequirements(
          { workOrderId: "availability", productId, variationId: null, multiplier: 1, modifierOptions: [] },
          context,
        ),
        availableByItem,
      );
      productCache.set(productId, resolved);
      return resolved;
    };
    const modifierOption = (modifierOptionId: string) => {
      if (modifierOptionOverrides.has(modifierOptionId)) return manual();
      if (!location.salesEnforcementEnabled) return unlimited();
      const requirements = (context.modifierRecipes.get(modifierOptionId) ?? []).map((row) => ({
        inventoryItemId: row.inventoryItemId,
        quantity: row.quantity,
      }));
      return resolveInventoryRequirementsAvailability(requirements, availableByItem);
    };

    return {
      enforced: location.salesEnforcementEnabled,
      product: (productId: string) => product(productId),
      variation,
      modifierOption,
    };
  });
}

function buildCheckoutSpecs(payload: PreparedOrderPayload): WorkUnitSpec[] {
  const specs: WorkUnitSpec[] = [];
  let index = 0;
  for (const preparedItem of payload.items) {
    const quantity = Number(preparedItem.item.quantity ?? 0);
    if (preparedItem.compoundComponents.length > 0) {
      for (const component of preparedItem.compoundComponents) {
        specs.push({
          workOrderId: `checkout-${index}`,
          productId: component.componentProductId,
          variationId: component.variationId ?? null,
          multiplier: quantity * Number(component.quantity ?? 1),
          modifierOptions: (component.modifiersSnapshot ?? []).map((modifier) => ({
            modifierOptionId: modifier.modifierOptionId,
            quantity: modifier.quantity,
          })),
        });
        index += 1;
      }
      continue;
    }
    specs.push({
      workOrderId: `checkout-${index}`,
      productId: preparedItem.item.productId,
      variationId: preparedItem.item.variationId ?? null,
      multiplier: quantity,
      modifierOptions: preparedItem.modifiers.map((modifier) => ({
        modifierOptionId: modifier.modifierOptionId,
        quantity: Number(modifier.quantity ?? 1),
      })),
    });
    index += 1;
  }
  return specs;
}

async function releaseReservationById(tx: TransactionDb, reservationId: string) {
  const rowsResult = await tx.execute(sql`
    select
      a.id,
      a.inventory_item_id as "inventoryItemId",
      a.lot_id as "lotId",
      a.reserved_quantity as "reservedQuantity",
      a.consumed_quantity as "consumedQuantity",
      a.released_quantity as "releasedQuantity",
      r.location_id as "locationId"
    from inventory_reservation_allocation a
    inner join inventory_reservation r on r.id = a.reservation_id
    where a.reservation_id = ${reservationId}
    order by a.inventory_item_id, a.lot_id, a.id
    for update of a
  `);
  const reservationResult = await tx.execute(sql`
    select id, status, location_id as "locationId"
    from inventory_reservation
    where id = ${reservationId}
    for update
  `);
  const reservation = reservationResult.rows[0] as
    | { id: string; status: string; locationId: string }
    | undefined;
  if (!reservation || !["active", "partially_consumed"].includes(reservation.status)) return;

  const movementId = generateNanoId();
  await tx.insert(inventoryMovementsDB).values({
    id: movementId,
    locationId: reservation.locationId,
    type: "reservation_release",
    reservationId,
  });
  for (const raw of rowsResult.rows) {
    const allocation = raw as {
      id: string;
      inventoryItemId: string;
      lotId: string;
      locationId: string;
      reservedQuantity: string | number;
      consumedQuantity: string | number;
      releasedQuantity: string | number;
    };
    const quantity = roundQuantity(
      Number(allocation.reservedQuantity) -
        Number(allocation.consumedQuantity) -
        Number(allocation.releasedQuantity),
    );
    if (quantity <= 0) continue;
    const balanceResult = await tx.execute(sql`
      select on_hand_quantity as "onHandQuantity", reserved_quantity as "reservedQuantity"
      from inventory_balance
      where location_id = ${allocation.locationId}
        and inventory_item_id = ${allocation.inventoryItemId}
        and lot_id = ${allocation.lotId}
      for update
    `);
    const balance = balanceResult.rows[0] as
      | { onHandQuantity: string | number; reservedQuantity: string | number }
      | undefined;
    if (!balance) continue;
    const reservedAfter = Math.max(0, roundQuantity(Number(balance.reservedQuantity) - quantity));
    await tx
      .update(inventoryBalancesDB)
      .set({ reservedQuantity: reservedAfter, updatedAt: new Date() })
      .where(
        and(
          eq(inventoryBalancesDB.locationId, allocation.locationId),
          eq(inventoryBalancesDB.inventoryItemId, allocation.inventoryItemId),
          eq(inventoryBalancesDB.lotId, allocation.lotId),
        ),
      );
    await tx
      .update(inventoryReservationAllocationsDB)
      .set({
        releasedQuantity: sql`${inventoryReservationAllocationsDB.releasedQuantity} + ${quantity}`,
        updatedAt: new Date(),
      })
      .where(eq(inventoryReservationAllocationsDB.id, allocation.id));
    await tx.insert(inventoryMovementLinesDB).values({
      id: generateNanoId(),
      movementId,
      inventoryItemId: allocation.inventoryItemId,
      lotId: allocation.lotId,
      onHandDelta: 0,
      reservedDelta: -quantity,
      onHandAfter: Number(balance.onHandQuantity),
      reservedAfter,
    });
  }
  await tx
    .update(inventoryReservationsDB)
    .set({ status: "released", releasedAt: new Date(), updatedAt: new Date() })
    .where(eq(inventoryReservationsDB.id, reservationId));
}

export async function releaseWorkOrderInventory(
  tx: TransactionDb,
  input: { workOrderId: string; actorUserId: string },
) {
  const allocationsResult = await tx.execute(sql`
    select
      a.id,
      a.reservation_id as "reservationId",
      a.inventory_item_id as "inventoryItemId",
      a.lot_id as "lotId",
      a.reserved_quantity as "reservedQuantity",
      a.consumed_quantity as "consumedQuantity",
      a.released_quantity as "releasedQuantity",
      r.location_id as "locationId",
      r.order_id as "orderId"
    from inventory_reservation_allocation a
    inner join inventory_reservation r on r.id = a.reservation_id
    where a.work_order_id = ${input.workOrderId}
      and r.status in ('active', 'partially_consumed')
    order by a.inventory_item_id, a.lot_id, a.id
    for update of a
  `);
  if (allocationsResult.rows.length === 0) return;

  const first = allocationsResult.rows[0] as {
    reservationId: string;
    locationId: string;
    orderId: string;
  };
  const movementId = generateNanoId();
  let hasReleasedQuantity = false;

  for (const raw of allocationsResult.rows) {
    const allocation = raw as {
      id: string;
      inventoryItemId: string;
      lotId: string;
      locationId: string;
      reservedQuantity: string | number;
      consumedQuantity: string | number;
      releasedQuantity: string | number;
    };
    const quantity = roundQuantity(
      Number(allocation.reservedQuantity) -
        Number(allocation.consumedQuantity) -
        Number(allocation.releasedQuantity),
    );
    if (quantity <= 0) continue;

    if (!hasReleasedQuantity) {
      await tx.insert(inventoryMovementsDB).values({
        id: movementId,
        locationId: first.locationId,
        type: "reservation_release",
        reservationId: first.reservationId,
        orderId: first.orderId,
        workOrderId: input.workOrderId,
        actorUserId: input.actorUserId,
      });
      hasReleasedQuantity = true;
    }

    const balanceResult = await tx.execute(sql`
      select on_hand_quantity as "onHandQuantity", reserved_quantity as "reservedQuantity"
      from inventory_balance
      where location_id = ${allocation.locationId}
        and inventory_item_id = ${allocation.inventoryItemId}
        and lot_id = ${allocation.lotId}
      for update
    `);
    const balance = balanceResult.rows[0] as
      | { onHandQuantity: string | number; reservedQuantity: string | number }
      | undefined;
    if (!balance) continue;
    const reservedAfter = Math.max(
      0,
      roundQuantity(Number(balance.reservedQuantity) - quantity),
    );
    await tx
      .update(inventoryBalancesDB)
      .set({ reservedQuantity: reservedAfter, updatedAt: new Date() })
      .where(
        and(
          eq(inventoryBalancesDB.locationId, allocation.locationId),
          eq(inventoryBalancesDB.inventoryItemId, allocation.inventoryItemId),
          eq(inventoryBalancesDB.lotId, allocation.lotId),
        ),
      );
    await tx
      .update(inventoryReservationAllocationsDB)
      .set({
        releasedQuantity: sql`${inventoryReservationAllocationsDB.releasedQuantity} + ${quantity}`,
        updatedAt: new Date(),
      })
      .where(eq(inventoryReservationAllocationsDB.id, allocation.id));
    await tx.insert(inventoryMovementLinesDB).values({
      id: generateNanoId(),
      movementId,
      inventoryItemId: allocation.inventoryItemId,
      lotId: allocation.lotId,
      onHandDelta: 0,
      reservedDelta: -quantity,
      onHandAfter: Number(balance.onHandQuantity),
      reservedAfter,
    });
  }

  if (!hasReleasedQuantity) return;
  const remainingResult = await tx.execute(sql`
    select coalesce(sum(reserved_quantity - consumed_quantity - released_quantity), 0) as remaining
    from inventory_reservation_allocation
    where reservation_id = ${first.reservationId}
  `);
  const remaining = Number((remainingResult.rows[0] as { remaining?: string })?.remaining ?? 0);
  await tx
    .update(inventoryReservationsDB)
    .set({
      status: remaining <= 0.0000001 ? "released" : "partially_consumed",
      releasedAt: remaining <= 0.0000001 ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(inventoryReservationsDB.id, first.reservationId));
}

export async function releaseCheckoutInventory(
  tx: TransactionDb,
  paymentAttemptId: string | null | undefined,
) {
  if (!paymentAttemptId) return;
  const result = await tx.execute(sql`
    select id from inventory_reservation
    where payment_attempt_id = ${paymentAttemptId}
      and kind = 'checkout'
      and status in ('active', 'partially_consumed')
    order by created_at asc
    for update
  `);
  for (const row of result.rows as Array<{ id: string }>) {
    await releaseReservationById(tx, row.id);
  }
}

export async function releaseExpiredCheckoutInventory(tx: TransactionDb) {
  const result = await tx.execute(sql`
    select id from inventory_reservation
    where kind = 'checkout' and status = 'active' and expires_at <= now()
    order by expires_at asc
    for update skip locked
    limit 100
  `);
  for (const row of result.rows as Array<{ id: string }>) {
    await releaseReservationById(tx, row.id);
    await tx
      .update(inventoryReservationsDB)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(inventoryReservationsDB.id, row.id));
  }
}

export async function reserveCheckoutInventory(
  tx: TransactionDb,
  input: {
    organizationId: string;
    paymentAttemptId: string;
    payload: PreparedOrderPayload;
    scheduledFor: Date | null;
    expiresAt: Date;
  },
) {
  await releaseExpiredCheckoutInventory(tx);
  const locationResult = await tx.execute(sql`
    select id, timezone, sales_enforcement_enabled as "salesEnforcementEnabled"
    from inventory_location
    where organization_id = ${input.organizationId}
      and type = 'branch' and is_default_sales_location = true and deleted_at is null
    limit 1
  `);
  const location = locationResult.rows[0] as
    | { id: string; timezone: string; salesEnforcementEnabled: boolean }
    | undefined;
  if (!location?.salesEnforcementEnabled) return null;

  await syncInventoryItems(tx);
  const context = await loadRequirementContext(tx);
  const aggregate = new Map<string, number>();
  for (const spec of buildCheckoutSpecs(input.payload)) {
    for (const requirement of resolveWorkUnitRequirements(spec, context)) {
      aggregate.set(
        requirement.inventoryItemId,
        roundQuantity((aggregate.get(requirement.inventoryItemId) ?? 0) + requirement.quantity),
      );
    }
  }
  const requirements = [...aggregate.entries()]
    .map(([inventoryItemId, quantity]) => ({ inventoryItemId, quantity }))
    .sort((left, right) => left.inventoryItemId.localeCompare(right.inventoryItemId));
  if (requirements.length === 0) return null;
  const reservationId = generateNanoId();
  const movementId = generateNanoId();
  const eligibleDate = localDate(input.scheduledFor ?? new Date(), location.timezone);
  await tx.insert(inventoryReservationsDB).values({
    id: reservationId,
    locationId: location.id,
    kind: "checkout",
    status: "active",
    paymentAttemptId: input.paymentAttemptId,
    requirementsSnapshot: requirements.map((requirement) => ({ ...requirement })),
    expiresAt: input.expiresAt,
  });
  await tx.insert(inventoryMovementsDB).values({
    id: movementId,
    locationId: location.id,
    type: "checkout_reserve",
    reservationId,
  });

  for (const requirement of requirements) {
    let remaining = requirement.quantity;
    const result = await tx.execute(sql`
      select b.lot_id as "lotId", b.on_hand_quantity as "onHandQuantity",
        b.reserved_quantity as "reservedQuantity"
      from inventory_balance b
      inner join inventory_lot l on l.id = b.lot_id
      where b.location_id = ${location.id}
        and b.inventory_item_id = ${requirement.inventoryItemId}
        and (l.expires_on is null or l.expires_on >= ${eligibleDate}::date)
        and b.on_hand_quantity > b.reserved_quantity
      order by l.expires_on asc nulls last, l.created_at asc, l.id asc
      for update of b
    `);
    for (const raw of result.rows) {
      if (remaining <= 0.0000001) break;
      const balance = raw as {
        lotId: string;
        onHandQuantity: string | number;
        reservedQuantity: string | number;
      };
      const available = Number(balance.onHandQuantity) - Number(balance.reservedQuantity);
      const allocated = roundQuantity(Math.min(available, remaining));
      if (allocated <= 0) continue;
      const reservedAfter = roundQuantity(Number(balance.reservedQuantity) + allocated);
      await tx
        .update(inventoryBalancesDB)
        .set({ reservedQuantity: reservedAfter, updatedAt: new Date() })
        .where(
          and(
            eq(inventoryBalancesDB.locationId, location.id),
            eq(inventoryBalancesDB.inventoryItemId, requirement.inventoryItemId),
            eq(inventoryBalancesDB.lotId, balance.lotId),
          ),
        );
      await tx.insert(inventoryReservationAllocationsDB).values({
        id: generateNanoId(),
        reservationId,
        inventoryItemId: requirement.inventoryItemId,
        lotId: balance.lotId,
        reservedQuantity: allocated,
      });
      await tx.insert(inventoryMovementLinesDB).values({
        id: generateNanoId(),
        movementId,
        inventoryItemId: requirement.inventoryItemId,
        lotId: balance.lotId,
        onHandDelta: 0,
        reservedDelta: allocated,
        onHandAfter: Number(balance.onHandQuantity),
        reservedAfter,
      });
      remaining = roundQuantity(remaining - allocated);
    }
    if (remaining > 0.0000001) {
      throw conflict(
        "inventory.insufficientStock",
        "One or more order items are unavailable at this branch",
        {
          inventoryItemId: requirement.inventoryItemId,
          requestedQuantity: requirement.quantity,
          availableQuantity: roundQuantity(requirement.quantity - remaining),
        },
      );
    }
  }
  return reservationId;
}

export async function prepareOrderInventory(
  tx: TransactionDb,
  input: {
    organizationId: string;
    payload: PreparedOrderPayload;
    workOrders: WorkOrderInsert[];
  },
): Promise<PreparedOrderInventoryPlan> {
  const locationResult = await tx.execute(sql`
    select id, timezone, sales_enforcement_enabled as "salesEnforcementEnabled"
    from inventory_location
    where organization_id = ${input.organizationId}
      and type = 'branch'
      and is_default_sales_location = true
      and deleted_at is null
    limit 1
  `);
  const location = locationResult.rows[0] as
    | { id: string; timezone: string; salesEnforcementEnabled: boolean }
    | undefined;

  if (!location?.salesEnforcementEnabled) {
    return {
      enforced: false,
      locationId: location?.id ?? null,
      timezone: location?.timezone ?? null,
      workOrders: input.workOrders,
      requirements: [],
    };
  }

  await syncInventoryItems(tx);
  const specs = buildWorkUnitSpecs(input.payload, input.workOrders);
  const context = await loadRequirementContext(tx);
  const requirementsByWorkOrder = new Map(
    specs.map((spec) => [spec.workOrderId, resolveWorkUnitRequirements(spec, context)]),
  );
  const aggregate = new Map<string, number>();
  const workOrders = input.workOrders.map((workOrder) => {
    const requirements = requirementsByWorkOrder.get(workOrder.id) ?? [];
    for (const requirement of requirements) {
      aggregate.set(
        requirement.inventoryItemId,
        roundQuantity(
          (aggregate.get(requirement.inventoryItemId) ?? 0) + requirement.quantity,
        ),
      );
    }
    return { ...workOrder, inventoryRequirementsSnapshot: requirements };
  });

  return {
    enforced: true,
    locationId: location.id,
    timezone: location.timezone,
    workOrders,
    requirements: [...aggregate.entries()].map(([inventoryItemId, quantity]) => ({
      inventoryItemId,
      quantity,
    })),
  };
}

export async function reserveOrderInventory(
  tx: TransactionDb,
  input: {
    plan: PreparedOrderInventoryPlan;
    orderId: string;
    scheduledFor: Date | null;
    paymentAttemptId?: string | null;
  },
) {
  if (!input.plan.enforced || !input.plan.locationId || !input.plan.timezone) return null;
  await releaseExpiredCheckoutInventory(tx);
  await releaseCheckoutInventory(tx, input.paymentAttemptId);
  if (input.plan.requirements.length === 0) return null;

  const reservationId = generateNanoId();
  const movementId = generateNanoId();
  const eligibleDate = localDate(input.scheduledFor ?? new Date(), input.plan.timezone);
  await tx.insert(inventoryReservationsDB).values({
    id: reservationId,
    locationId: input.plan.locationId,
    kind: "order",
    status: "active",
    orderId: input.orderId,
    requirementsSnapshot: input.plan.requirements.map((requirement) => ({
      inventoryItemId: requirement.inventoryItemId,
      quantity: requirement.quantity,
    })),
  });
  await tx.insert(inventoryMovementsDB).values({
    id: movementId,
    locationId: input.plan.locationId,
    type: "order_reserve",
    reservationId,
    orderId: input.orderId,
  });

  for (const workOrder of input.plan.workOrders) {
    const requirements = workOrder.inventoryRequirementsSnapshot ?? [];
    for (const requirement of requirements) {
      let remaining = Number(requirement.quantity);
      const balancesResult = await tx.execute(sql`
        select
          b.lot_id as "lotId",
          b.on_hand_quantity as "onHandQuantity",
          b.reserved_quantity as "reservedQuantity"
        from inventory_balance b
        inner join inventory_lot l on l.id = b.lot_id
        where b.location_id = ${input.plan.locationId}
          and b.inventory_item_id = ${requirement.inventoryItemId}
          and (l.expires_on is null or l.expires_on >= ${eligibleDate}::date)
          and b.on_hand_quantity > b.reserved_quantity
        order by l.expires_on asc nulls last, l.created_at asc, l.id asc
        for update of b
      `);

      for (const rawBalance of balancesResult.rows) {
        if (remaining <= 0.0000001) break;
        const balance = rawBalance as {
          lotId: string;
          onHandQuantity: string | number;
          reservedQuantity: string | number;
        };
        const available = Number(balance.onHandQuantity) - Number(balance.reservedQuantity);
        const allocated = roundQuantity(Math.min(available, remaining));
        if (allocated <= 0) continue;
        const reservedAfter = roundQuantity(Number(balance.reservedQuantity) + allocated);

        await tx
          .update(inventoryBalancesDB)
          .set({ reservedQuantity: reservedAfter, updatedAt: new Date() })
          .where(
            and(
              eq(inventoryBalancesDB.locationId, input.plan.locationId),
              eq(inventoryBalancesDB.inventoryItemId, requirement.inventoryItemId),
              eq(inventoryBalancesDB.lotId, balance.lotId),
            ),
          );
        await tx.insert(inventoryReservationAllocationsDB).values({
          id: generateNanoId(),
          reservationId,
          inventoryItemId: requirement.inventoryItemId,
          lotId: balance.lotId,
          workOrderId: workOrder.id,
          reservedQuantity: allocated,
        });
        await tx.insert(inventoryMovementLinesDB).values({
          id: generateNanoId(),
          movementId,
          inventoryItemId: requirement.inventoryItemId,
          lotId: balance.lotId,
          onHandDelta: 0,
          reservedDelta: allocated,
          onHandAfter: Number(balance.onHandQuantity),
          reservedAfter,
        });
        remaining = roundQuantity(remaining - allocated);
      }

      if (remaining > 0.0000001) {
        const available = roundQuantity(Number(requirement.quantity) - remaining);
        throw conflict(
          "inventory.insufficientStock",
          "One or more order items are unavailable at this branch",
          {
            inventoryItemId: requirement.inventoryItemId,
            requestedQuantity: requirement.quantity,
            availableQuantity: available,
            workOrderId: workOrder.id,
          },
        );
      }
    }
  }

  return reservationId;
}

export async function consumeWorkOrderInventory(
  tx: TransactionDb,
  input: { workOrderId: string; actorUserId: string },
) {
  const allocationsResult = await tx.execute(sql`
    select
      a.id,
      a.reservation_id as "reservationId",
      a.inventory_item_id as "inventoryItemId",
      a.lot_id as "lotId",
      a.reserved_quantity as "reservedQuantity",
      a.consumed_quantity as "consumedQuantity",
      a.released_quantity as "releasedQuantity",
      r.location_id as "locationId",
      r.order_id as "orderId"
    from inventory_reservation_allocation a
    inner join inventory_reservation r on r.id = a.reservation_id
    where a.work_order_id = ${input.workOrderId}
      and r.status in ('active', 'partially_consumed')
    order by a.inventory_item_id, a.lot_id, a.id
    for update of a
  `);
  if (allocationsResult.rows.length === 0) return;

  const first = allocationsResult.rows[0] as {
    reservationId: string;
    locationId: string;
    orderId: string;
  };
  const movementId = generateNanoId();
  await tx.insert(inventoryMovementsDB).values({
    id: movementId,
    locationId: first.locationId,
    type: "sale_consumption",
    reservationId: first.reservationId,
    orderId: first.orderId,
    workOrderId: input.workOrderId,
    actorUserId: input.actorUserId,
  });

  for (const raw of allocationsResult.rows) {
    const allocation = raw as {
      id: string;
      inventoryItemId: string;
      lotId: string;
      locationId: string;
      reservedQuantity: string | number;
      consumedQuantity: string | number;
      releasedQuantity: string | number;
    };
    const quantity = roundQuantity(
      Number(allocation.reservedQuantity) -
        Number(allocation.consumedQuantity) -
        Number(allocation.releasedQuantity),
    );
    if (quantity <= 0) continue;
    const balanceResult = await tx.execute(sql`
      select on_hand_quantity as "onHandQuantity", reserved_quantity as "reservedQuantity"
      from inventory_balance
      where location_id = ${allocation.locationId}
        and inventory_item_id = ${allocation.inventoryItemId}
        and lot_id = ${allocation.lotId}
      for update
    `);
    const balance = balanceResult.rows[0] as
      | { onHandQuantity: string | number; reservedQuantity: string | number }
      | undefined;
    if (!balance || Number(balance.onHandQuantity) + 0.0000001 < quantity) {
      throw conflict(
        "inventory.reservationDeficit",
        "Reserved inventory is no longer physically available",
        { inventoryItemId: allocation.inventoryItemId, lotId: allocation.lotId, quantity },
      );
    }
    const onHandAfter = roundQuantity(Number(balance.onHandQuantity) - quantity);
    const reservedAfter = roundQuantity(Number(balance.reservedQuantity) - quantity);
    await tx
      .update(inventoryBalancesDB)
      .set({ onHandQuantity: onHandAfter, reservedQuantity: reservedAfter, updatedAt: new Date() })
      .where(
        and(
          eq(inventoryBalancesDB.locationId, allocation.locationId),
          eq(inventoryBalancesDB.inventoryItemId, allocation.inventoryItemId),
          eq(inventoryBalancesDB.lotId, allocation.lotId),
        ),
      );
    await tx
      .update(inventoryReservationAllocationsDB)
      .set({
        consumedQuantity: sql`${inventoryReservationAllocationsDB.consumedQuantity} + ${quantity}`,
        updatedAt: new Date(),
      })
      .where(eq(inventoryReservationAllocationsDB.id, allocation.id));
    await tx.insert(inventoryMovementLinesDB).values({
      id: generateNanoId(),
      movementId,
      inventoryItemId: allocation.inventoryItemId,
      lotId: allocation.lotId,
      onHandDelta: -quantity,
      reservedDelta: -quantity,
      onHandAfter,
      reservedAfter,
    });
  }

  const remainingResult = await tx.execute(sql`
    select coalesce(sum(a.reserved_quantity - a.consumed_quantity - a.released_quantity), 0) as remaining
    from inventory_reservation_allocation a
    where a.reservation_id = ${first.reservationId}
  `);
  const remaining = Number((remainingResult.rows[0] as { remaining?: string })?.remaining ?? 0);
  await tx
    .update(inventoryReservationsDB)
    .set({ status: remaining <= 0.0000001 ? "consumed" : "partially_consumed", updatedAt: new Date() })
    .where(eq(inventoryReservationsDB.id, first.reservationId));
}
