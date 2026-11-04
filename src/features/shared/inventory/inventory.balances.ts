import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
type TransactionDb = Parameters<Parameters<FastifyInstance["db"]["transaction"]>[0]>[0];

/** A deficit on any lot blocks new reservations for the article, including when
 * other lots have stock. Existing allocations remain untouched for resolution.
 */
export async function loadReservableBalances(
  tx: Pick<TransactionDb, "execute">,
  locationId: string,
  inventoryItemId: string,
  eligibleDate: string,
) {
  return tx.execute(sql`
    select b.lot_id as "lotId", b.on_hand_quantity as "onHandQuantity", b.reserved_quantity as "reservedQuantity"
    from inventory_balance b inner join inventory_lot l on l.id = b.lot_id
    where b.location_id = ${locationId} and b.inventory_item_id = ${inventoryItemId}
      and (l.expires_on is null or l.expires_on >= ${eligibleDate}::date)
      and b.on_hand_quantity > b.reserved_quantity
      and not exists (select 1 from inventory_balance deficit
        where deficit.location_id = b.location_id and deficit.inventory_item_id = b.inventory_item_id
          and deficit.on_hand_quantity < deficit.reserved_quantity)
    order by l.expires_on asc nulls last, l.created_at asc, l.id asc
    for update of b
  `);
}
