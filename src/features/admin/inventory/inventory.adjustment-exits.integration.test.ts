import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { adminInventoryService } from "./inventory.service";

const connectionString = process.env.INVENTORY_ADJUSTMENTS_TEST_DATABASE_URL;
describe.skipIf(!connectionString)("inventory adjustment exits with PostgreSQL", () => {
  const schema = `adjustment_exit_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString });
  const pool = new Pool({ connectionString, options: `-c search_path=${schema},public`, max: 5 });
  const service = adminInventoryService({ db: drizzle(pool) } as unknown as FastifyInstance);
  const context = { userId: "admin", organizationId: "branch", locationId: "loc" };
  const exit = (quantity: number, lotId?: string) =>
    service.createAdjustment({
      ...context,
      direction: "exit",
      reason: "waste",
      observations: null,
      lines: [{ inventoryItemId: "inv_ing_roll", quantity, lotId }],
    });
  const stocks = async () =>
    (
      await pool.query(`select lot_id as id,
    on_hand_quantity::float as quantity, reserved_quantity::float as reserved
    from inventory_balance where location_id='loc' order by lot_id`)
    ).rows;

  beforeAll(async () => {
    const url = new URL(connectionString!);
    if (
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      !url.pathname.includes("test")
    ) {
      throw new Error("This suite requires a local test database, never production");
    }
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await pool.query(
      await readFile(new URL("./counts/counts.test-baseline.sql", import.meta.url), "utf8"),
    );
    await pool.query(`
      ALTER TABLE "user" ADD COLUMN middle_name text, ADD COLUMN last_name text;
      CREATE TABLE inventory_adjustment (
        id text PRIMARY KEY, location_id text NOT NULL REFERENCES inventory_location(id),
        direction text NOT NULL, reason text NOT NULL, observations text, created_by_user_id text NOT NULL,
        reversed_at timestamptz, reversed_by_user_id text, reversal_adjustment_id text,
        created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now());
      CREATE TABLE inventory_adjustment_line (
        id text PRIMARY KEY, adjustment_id text NOT NULL REFERENCES inventory_adjustment(id),
        inventory_item_id text NOT NULL REFERENCES inventory_item(id), lot_id text NOT NULL REFERENCES inventory_lot(id),
        quantity numeric(12,6) NOT NULL CHECK(quantity>0), created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now());
    `);
    const migration = await readFile(
      new URL("../../../../drizzle/0035_inventory_counts.sql", import.meta.url),
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint"))
      await pool.query(statement);
  });
  afterAll(async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  });
  beforeEach(async () => {
    await pool.query(`
      TRUNCATE inventory_adjustment_line,inventory_adjustment,inventory_movement_line,inventory_movement,
        inventory_balance,inventory_stock_revision,inventory_lot,inventory_location_item,inventory_item,
        ingredient,inventory_location,organization,"user",unit CASCADE;
      INSERT INTO "user" (id,name,role) VALUES ('admin','Admin','customer');
      INSERT INTO organization (id,name,slug,timezone) VALUES ('branch','Metropark','branch','America/Mexico_City'),('other','Otra','other','America/Mexico_City');
      INSERT INTO inventory_location (id,name,type,organization_id,timezone) VALUES ('loc','Metropark','branch','branch','America/Mexico_City'),('other-loc','Otra','branch','other','America/Mexico_City');
      INSERT INTO unit (id,name,abbreviation,precision) VALUES ('pcs','Piezas','pza',6);
      INSERT INTO ingredient (id,name,base_unit_id,is_inventory_tracked,tracks_lots,is_perishable) VALUES ('roll','Roll de Canela','pcs',true,false,false),('other','Otro','pcs',true,false,false);
      INSERT INTO inventory_item (id,kind,ingredient_id,base_unit_id) VALUES ('inv_ing_roll','ingredient','roll','pcs'),('inv_ing_other','ingredient','other','pcs');
      INSERT INTO inventory_lot (id,inventory_item_id,internal_batch_key,created_at) VALUES
        ('a','inv_ing_roll','count-partition','2026-10-31'),('b','inv_ing_roll','purchase-one','2026-11-01'),
        ('c','inv_ing_roll','purchase-two','2026-11-02'),('foreign','inv_ing_other','other-item','2026-11-01');
      INSERT INTO inventory_balance (location_id,inventory_item_id,lot_id,on_hand_quantity,reserved_quantity) VALUES
        ('loc','inv_ing_roll','a',11,0),('loc','inv_ing_roll','b',8,0),('loc','inv_ing_roll','c',8,2),('other-loc','inv_ing_roll','a',43,0);
    `);
  });

  it("takes 10 rolls without a default lot, preserving other partitions and branch stock", async () => {
    const result = await exit(10);
    expect(result.observations).toBeNull();
    expect(result.lines.map((line) => [line.lotId, line.quantity])).toEqual([["a", 10]]);
    expect(await stocks()).toEqual([
      { id: "a", quantity: 1, reserved: 0 },
      { id: "b", quantity: 8, reserved: 0 },
      { id: "c", quantity: 8, reserved: 2 },
    ]);
    expect(
      Number(
        (
          await pool.query(
            "select on_hand_quantity from inventory_balance where location_id='other-loc'",
          )
        ).rows[0].on_hand_quantity,
      ),
    ).toBe(43);
    expect((await pool.query("select type from inventory_movement")).rows).toEqual([
      { type: "adjustment_exit" },
    ]);
  });
  it("can exit new adjustment entries together with existing partitions, even with an empty default lot", async () => {
    await pool.query(`
      UPDATE inventory_balance SET reserved_quantity=0 WHERE location_id='loc';
      INSERT INTO inventory_lot (id,inventory_item_id,internal_batch_key) VALUES ('default','inv_ing_roll','default');
      INSERT INTO inventory_balance (location_id,inventory_item_id,lot_id,on_hand_quantity) VALUES ('loc','inv_ing_roll','default',0);
    `);
    await service.createAdjustment({
      ...context,
      direction: "entry",
      reason: "initial_inventory",
      lines: [{ inventoryItemId: "inv_ing_roll", quantity: 5 }],
    });
    const result = await exit(32);
    expect(result.lines.reduce((sum, line) => sum + line.quantity, 0)).toBe(32);
    expect((await stocks()).every((row) => row.quantity === 0)).toBe(true);
  });
  it("splits one exit across partitions and reverses the exact original allocations", async () => {
    const result = await exit(20);
    expect(result.lines.map((line) => [line.lotId, line.quantity]).sort()).toEqual([
      ["a", 11],
      ["b", 8],
      ["c", 1],
    ]);
    await service.reverseAdjustment({ ...context, adjustmentId: result.id });
    expect(await stocks()).toEqual([
      { id: "a", quantity: 11, reserved: 0 },
      { id: "b", quantity: 8, reserved: 0 },
      { id: "c", quantity: 8, reserved: 2 },
    ]);
    expect(
      Number(
        (await pool.query("select sum(on_hand_delta) as delta from inventory_movement_line"))
          .rows[0].delta,
      ),
    ).toBe(0);
  });
  it("skips the reserved units in an older partition and completes the exit from another one", async () => {
    await pool.query(`
      update inventory_balance
      set on_hand_quantity=case lot_id when 'a' then 84 when 'b' then 25 else 500 end,
        reserved_quantity=case lot_id when 'a' then 2 else 0 end
      where location_id='loc';
    `);

    const result = await exit(100);
    expect(result.lines.map((line) => [line.lotId, line.quantity]).sort()).toEqual([
      ["a", 82],
      ["b", 18],
    ]);
    expect(await stocks()).toEqual([
      { id: "a", quantity: 2, reserved: 2 },
      { id: "b", quantity: 7, reserved: 0 },
      { id: "c", quantity: 500, reserved: 0 },
    ]);
  });
  it("rolls back the complete adjustment if a later line exceeds remaining unreserved stock", async () => {
    await expect(
      service.createAdjustment({
        ...context,
        direction: "exit",
        reason: "waste",
        lines: [
          { inventoryItemId: "inv_ing_roll", quantity: 10 },
          { inventoryItemId: "inv_ing_roll", quantity: 16 },
        ],
      }),
    ).rejects.toMatchObject({
      code: "inventory.insufficientPhysicalStock",
      data: { onHandQuantity: 17, availableQuantity: 15, requestedQuantity: 16 },
    });
    expect((await stocks()).map((row) => row.quantity)).toEqual([11, 8, 8]);
    expect(
      (await pool.query("select count(*)::int as n from inventory_adjustment")).rows[0].n,
    ).toBe(0);
    expect((await pool.query("select count(*)::int as n from inventory_movement")).rows[0].n).toBe(
      0,
    );
  });
  it("does not consume another branch's stock when this branch is empty", async () => {
    await pool.query(
      "update inventory_balance set on_hand_quantity=0,reserved_quantity=0 where location_id='loc'",
    );
    await expect(exit(10)).rejects.toMatchObject({
      code: "inventory.insufficientPhysicalStock",
      data: { onHandQuantity: 0 },
    });
  });
  it.each(["tracks_lots", "is_perishable"])(
    "keeps explicit lot selection mandatory for %s",
    async (flag) => {
      await pool.query(`update ingredient set ${flag}=true where id='roll'`);
      await expect(exit(10)).rejects.toMatchObject({ code: "inventory.lotSelectionRequired" });
      expect((await exit(10, "a")).lines[0]?.lotId).toBe("a");
    },
  );
  it("rejects an explicit lot belonging to another article", async () => {
    await expect(exit(10, "foreign")).rejects.toMatchObject({ code: "inventory.lotNotFound" });
    expect((await stocks()).map((row) => row.quantity)).toEqual([11, 8, 8]);
  });
  it("honors the chosen lot and preserves its reservations even for an expired lot", async () => {
    await pool.query("update inventory_lot set expires_on='2020-01-01' where id='c'");
    await expect(exit(7, "c")).rejects.toMatchObject({
      code: "inventory.insufficientPhysicalStock",
      data: { lotId: "c", onHandQuantity: 8, availableQuantity: 6, requestedQuantity: 7 },
    });
    expect((await exit(6, "c")).lines.map((line) => [line.lotId, line.quantity])).toEqual([
      ["c", 6],
    ]);
    expect(await stocks()).toEqual([
      { id: "a", quantity: 11, reserved: 0 },
      { id: "b", quantity: 8, reserved: 0 },
      { id: "c", quantity: 2, reserved: 2 },
    ]);
  });
  it("blocks an entry reversal when its exact lot would lose reserved stock", async () => {
    const entry = await service.createAdjustment({
      ...context,
      direction: "entry",
      reason: "initial_inventory",
      lines: [{ inventoryItemId: "inv_ing_roll", quantity: 5 }],
    });
    const lotId = entry.lines[0]!.lotId;
    await pool.query(
      "update inventory_balance set reserved_quantity=2 where location_id='loc' and lot_id=$1",
      [lotId],
    );

    await expect(
      service.reverseAdjustment({ ...context, adjustmentId: entry.id }),
    ).rejects.toMatchObject({
      code: "inventory.insufficientPhysicalStock",
      data: { lotId, onHandQuantity: 5, availableQuantity: 3, requestedQuantity: 5 },
    });
    expect(await stocks()).toContainEqual({ id: lotId, quantity: 5, reserved: 2 });
    expect((await pool.query("select type from inventory_movement")).rows).toEqual([
      { type: "adjustment_entry" },
    ]);
  });
  it("handles fractional quantities without a remainder or negative balances", async () => {
    await pool.query(
      "update inventory_balance set on_hand_quantity=case lot_id when 'a' then 0.1 when 'b' then 0.2 else 0 end,reserved_quantity=0 where location_id='loc'",
    );
    const result = await exit(0.3);
    expect(result.lines.reduce((sum, line) => sum + line.quantity, 0)).toBeCloseTo(0.3, 6);
    expect((await stocks()).map((row) => row.quantity)).toEqual([0, 0, 0]);
  });
  it("serializes competing exits so only one can consume the remaining stock", async () => {
    const result = await Promise.allSettled([exit(20), exit(20)]);
    expect(result.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    expect(result.filter((row) => row.status === "rejected")).toHaveLength(1);
    expect((await stocks()).reduce((sum, row) => sum + row.quantity, 0)).toBe(7);
  });
});
