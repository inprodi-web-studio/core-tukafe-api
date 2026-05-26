import { pool } from "@core/db";

const PROMOTION_BACKFILL_LOCK_KEY = 720250041;

type PromotionState = {
  progressCount: number;
  candidateProductIds: string[];
};

type OrderItemRow = {
  customerId: string;
  productId: string;
  quantity: string;
  freeUnits: number;
};

function isWholeUnitQuantity(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function applyPaidUnit(state: PromotionState, productId: string): PromotionState {
  const candidateIdsSet = new Set(state.candidateProductIds);
  const nextState: PromotionState = {
    progressCount: state.progressCount,
    candidateProductIds: [...state.candidateProductIds],
  };

  if (nextState.progressCount < 4) {
    if (!candidateIdsSet.has(productId)) {
      nextState.candidateProductIds.push(productId);
    }
    nextState.progressCount = Math.min(4, nextState.progressCount + 1);
    return nextState;
  }

  if (!candidateIdsSet.has(productId)) {
    nextState.candidateProductIds.push(productId);
  }
  nextState.progressCount = 4;

  return nextState;
}

async function backfillPromotionState() {
  const client = await pool.connect();

  try {
    await client.query("begin;");
    await client.query("select pg_advisory_lock($1);", [PROMOTION_BACKFILL_LOCK_KEY]);

    const eligibleProductsResult = await client.query<{ id: string }>(`
      select p.id
      from product p
      inner join product_category pc on pc.id = p.category_id
      where p.deleted_at is null
        and pc.is_four_plus_one_eligible = true
    `);

    const eligibleProductIds = new Set(eligibleProductsResult.rows.map((row) => row.id));

    const orderItemsResult = await client.query<OrderItemRow>(`
      select
        o.customer_id as "customerId",
        oi.product_id as "productId",
        oi.quantity::text as "quantity",
        oi.free_units as "freeUnits"
      from "order" o
      inner join order_item oi on oi.order_id = o.id
      where o.customer_id is not null
      order by o.customer_id asc, o.created_at asc, o.id asc, oi.sort_order asc, oi.id asc
    `);

    const stateByCustomerId = new Map<string, PromotionState>();

    for (const row of orderItemsResult.rows) {
      if (!eligibleProductIds.has(row.productId)) {
        continue;
      }

      const quantity = Number(row.quantity);
      if (!isWholeUnitQuantity(quantity)) {
        continue;
      }

      const effectiveFreeUnits = Number.isInteger(row.freeUnits) ? Math.max(0, row.freeUnits) : 0;
      const paidUnits = Math.max(0, quantity - effectiveFreeUnits);

      if (paidUnits <= 0 && effectiveFreeUnits <= 0) {
        continue;
      }

      const currentState = stateByCustomerId.get(row.customerId) ?? {
        progressCount: 0,
        candidateProductIds: [],
      };

      let nextState = currentState;

      for (let currentUnit = 0; currentUnit < paidUnits; currentUnit += 1) {
        nextState = applyPaidUnit(nextState, row.productId);
      }

      if (effectiveFreeUnits > 0) {
        nextState = {
          progressCount: 0,
          candidateProductIds: [],
        };
      }

      stateByCustomerId.set(row.customerId, nextState);
    }

    await client.query(`delete from customer_order_promotion_state`);

    for (const [customerId, state] of stateByCustomerId.entries()) {
      await client.query(
        `
          insert into customer_order_promotion_state
            (customer_id, progress_count, candidate_product_ids, version, created_at, updated_at)
          values
            ($1, $2, $3::text[], 1, now(), now())
        `,
        [customerId, state.progressCount, state.candidateProductIds],
      );
    }

    await client.query("commit;");

    console.log(
      `[promo-backfill] Done. Customers processed: ${stateByCustomerId.size}. Eligible products: ${eligibleProductIds.size}.`,
    );
  } catch (error) {
    await client.query("rollback;");
    throw error;
  } finally {
    await client.query("select pg_advisory_unlock($1);", [PROMOTION_BACKFILL_LOCK_KEY]);
    client.release();
    await pool.end();
  }
}

backfillPromotionState().catch((error) => {
  console.error("[promo-backfill] Error:", error);
  process.exit(1);
});
