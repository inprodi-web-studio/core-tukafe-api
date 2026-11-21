import { inventoryLotsDB, type InventoryItem } from "@core/db/schemas";
import { conflict, notFound, validation } from "@core/utils";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

type TransactionDb = Parameters<Parameters<FastifyInstance["db"]["transaction"]>[0]>[0];
const roundQuantity = (value: number) => Math.round((value + Number.EPSILON) * 1e6) / 1e6;

export function insufficientAdjustmentStock(data: {
  inventoryItemId: string;
  lotId?: string;
  requestedQuantity: number;
  onHandQuantity: number;
  availableQuantity: number;
}) {
  return conflict(
    "inventory.insufficientPhysicalStock",
    "Insufficient unreserved stock for this inventory adjustment",
    data,
  );
}

export async function resolveAdjustmentExitAllocations(
  tx: Pick<TransactionDb, "select" | "execute">,
  input: {
    locationId: string;
    item: Pick<InventoryItem, "id" | "tracksLots" | "isPerishable">;
    quantity: number;
    lotId?: string | null;
  },
): Promise<Array<{ lotId: string; quantity: number }>> {
  if (!input.lotId && (input.item.tracksLots || input.item.isPerishable)) {
    throw validation(
      "inventory.lotSelectionRequired",
      "A lot must be selected for this inventory exit",
      { inventoryItemId: input.item.id },
    );
  }

  if (input.lotId) {
    const [lot] = await tx
      .select({ id: inventoryLotsDB.id })
      .from(inventoryLotsDB)
      .where(
        and(
          eq(inventoryLotsDB.inventoryItemId, input.item.id),
          eq(inventoryLotsDB.id, input.lotId),
        ),
      )
      .limit(1);
    if (!lot) {
      throw notFound("inventory.lotNotFound", "Inventory lot was not found", {
        inventoryItemId: input.item.id,
      });
    }
  }

  // Keep lot order for automatic allocation. Expired stock can still be removed
  // by an adjustment as long as it is unreserved.
  const result = await tx.execute(sql`
    select b.lot_id as "lotId", b.on_hand_quantity as "onHandQuantity",
      greatest(b.on_hand_quantity - b.reserved_quantity, 0) as "availableQuantity"
    from inventory_balance b
    inner join inventory_lot l on l.id = b.lot_id and l.inventory_item_id = b.inventory_item_id
    where b.location_id = ${input.locationId} and b.inventory_item_id = ${input.item.id}
      and b.on_hand_quantity > 0
      ${input.lotId ? sql`and b.lot_id = ${input.lotId}` : sql.empty()}
    order by l.expires_on asc nulls last, l.created_at asc, l.id asc
    for update of b
  `);
  const rows = result.rows as Array<{
    lotId: string;
    onHandQuantity: string | number;
    availableQuantity: string | number;
  }>;
  const availableQuantity = roundQuantity(
    rows.reduce((total, row) => total + Number(row.availableQuantity), 0),
  );
  if (roundQuantity(input.quantity - availableQuantity) > 0) {
    throw insufficientAdjustmentStock({
      inventoryItemId: input.item.id,
      ...(input.lotId ? { lotId: input.lotId } : {}),
      onHandQuantity: roundQuantity(
        rows.reduce((total, row) => total + Number(row.onHandQuantity), 0),
      ),
      availableQuantity,
      requestedQuantity: input.quantity,
    });
  }
  let remaining = input.quantity;
  const allocations = [];
  for (const row of rows) {
    const quantity = roundQuantity(Math.min(remaining, Number(row.availableQuantity)));
    if (quantity > 0) allocations.push({ lotId: row.lotId, quantity });
    remaining = roundQuantity(remaining - quantity);
    if (remaining === 0) break;
  }
  return allocations;
}
