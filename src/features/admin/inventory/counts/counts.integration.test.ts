import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminInventoryCountsService } from "./counts.service";
import type { CountDetail } from "./counts.schemas";
import { countDetailSchema } from "./counts.schemas";
import { loadReservableBalances } from "@features/shared/inventory/inventory.balances";

// Opt-in only: this suite creates and removes its own random schema, never public data.
const connectionString = process.env.INVENTORY_COUNTS_TEST_DATABASE_URL;
describe.skipIf(!connectionString)("physical counts with PostgreSQL", () => {
  const schema = `inventory_count_test_${randomUUID().replaceAll("-", "")}`;
  const adminPool = new Pool({ connectionString });
  const pool = new Pool({ connectionString, options: `-c search_path=${schema},public`, max: 6 });
  const db = drizzle(pool);
  const service = adminInventoryCountsService({ db } as unknown as FastifyInstance);
  const context = { userId: "admin", organizationId: "branch", locationId: "loc" };
  const scope = (doc: CountDetail) => ({ ...context, countId: doc.id, version: doc.version });
  const row = (doc: CountDetail, itemId: string) =>
    doc.items.find((i) => i.inventoryItemId === itemId)!.lines[0]!;
  async function physical(itemId: string, delta: number) {
    await pool.query(
      "UPDATE inventory_balance SET on_hand_quantity = on_hand_quantity + $1 WHERE location_id = 'loc' AND inventory_item_id = $2",
      [delta, itemId],
    );
  }
  async function create(ids = ["inv_ing_plain"]) {
    return service.create({ ...context, inventoryItemIds: ids });
  }
  async function capture(doc: CountDetail, quantity: number | null, itemId = "inv_ing_plain") {
    return service.save({
      ...scope(doc),
      lines: [{ id: row(doc, itemId).id, countedQuantity: quantity }],
    });
  }
  beforeAll(async () => {
    await adminPool.query(`CREATE SCHEMA "${schema}"`);
    const bootstrap = process.env.INVENTORY_COUNTS_TEST_BOOTSTRAP_SQL;
    const baseline = bootstrap
      ? await readFile(bootstrap, "utf8")
      : await readFile(new URL("./counts.test-baseline.sql", import.meta.url), "utf8");
    // Drizzle-generated baselines qualify public; rebind only for this disposable schema.
    await pool.query(baseline.replaceAll('"public".', `"${schema}".`));
    const migration = await readFile(
      new URL("../../../../../drizzle/0035_inventory_counts.sql", import.meta.url),
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint"))
      await pool.query(statement);
    await pool.query(`
      INSERT INTO "user" (id,name,email,role) VALUES ('admin','Admin','admin@counts.test','customer'), ('owner','Owner','owner@counts.test','owner');
      INSERT INTO organization (id,name,slug,timezone,address) VALUES ('branch','Sucursal','branch','America/Mexico_City','Prueba'),('other','Otra','other','America/Mexico_City','Prueba');
      INSERT INTO inventory_location (id,name,type,organization_id,timezone) VALUES ('loc','Sucursal','branch','branch','America/Mexico_City'),('other-loc','Otra','branch','other','America/Mexico_City');
      INSERT INTO unit (id,name,abbreviation,precision) VALUES ('pcs','Piezas','pz',0);
      INSERT INTO ingredient_category (id,name,color,icon) VALUES ('test','Prueba','#FFFFFF','CircleDashedIcon');
      INSERT INTO ingredient (id,name,base_unit_id,category_id,base_cost_per_unit,is_inventory_tracked,tracks_lots,is_perishable) VALUES ('plain','Simple','pcs','test',0,true,false,false),('milk','Leche','pcs','test',0,true,true,true),('other','Otro','pcs','test',0,true,false,false);
      INSERT INTO inventory_item (id,kind,ingredient_id,base_unit_id,is_tracked,tracks_lots,is_perishable) VALUES ('inv_ing_plain','ingredient','plain','pcs',true,false,false),('inv_ing_milk','ingredient','milk','pcs',true,true,true),('inv_ing_other','ingredient','other','pcs',true,false,false);
      INSERT INTO inventory_lot (id,inventory_item_id,internal_batch_key,lot_code,normalized_lot_code,expires_on) VALUES ('plain-lot','inv_ing_plain','a',null,null,null),('milk-lot','inv_ing_milk','lot:a','A','a','2099-01-01'),('other-lot','inv_ing_other','a',null,null,null);
      INSERT INTO inventory_balance (location_id,inventory_item_id,lot_id,on_hand_quantity,reserved_quantity) VALUES ('loc','inv_ing_plain','plain-lot',100,0),('loc','inv_ing_milk','milk-lot',20,0),('loc','inv_ing_other','other-lot',30,0);
    `);
  }, 30000);
  afterAll(async () => {
    await pool.end();
    await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await adminPool.end();
  });
  it("creates a snapshot without changing balances, saving zero is not a blank", async () => {
    const doc = await create();
    expect(row(doc, "inv_ing_plain").systemQuantity).toBe(100);
    expect(row(doc, "inv_ing_plain").countedQuantity).toBeNull();
    const saved = await capture(doc, 0);
    expect(row(saved, "inv_ing_plain").countedQuantity).toBe(0);
    expect(
      Number(
        (
          await pool.query(
            "SELECT on_hand_quantity FROM inventory_balance WHERE lot_id = 'plain-lot'",
          )
        ).rows[0].on_hand_quantity,
      ),
    ).toBe(100);
  });
  it("applies positive and negative deltas atomically and leaves blank items unchanged", async () => {
    const doc = await create(["inv_ing_plain", "inv_ing_milk", "inv_ing_other"]);
    const saved = await service.save({
      ...scope(doc),
      lines: [
        { id: row(doc, "inv_ing_plain").id, countedQuantity: 92 },
        { id: row(doc, "inv_ing_milk").id, countedQuantity: 25 },
      ],
    });
    const applied = await service.apply(scope(saved));
    expect(applied.status).toBe("applied");
    expect(countDetailSchema.safeParse(applied).success).toBe(true);
    expect(row(applied, "inv_ing_plain").appliedDelta).toBe(-8);
    expect(row(applied, "inv_ing_milk").appliedDelta).toBe(5);
    expect(row(applied, "inv_ing_other").appliedDelta).toBeNull();
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM inventory_movement_line WHERE movement_id=$1",
          [applied.movementId],
        )
      ).rows[0].n,
    ).toBe(2);
    expect((await service.apply(scope(saved))).movementId).toBe(applied.movementId);
    await expect(service.save({ ...scope(applied), lines: [] })).rejects.toMatchObject({
      code: "inventoryCount.notDraft",
    });
    await expect(service.cancel(scope(applied))).rejects.toMatchObject({
      code: "inventoryCount.notDraft",
    });
  });
  it("rejects net-zero physical movements, preserves capture on refresh, and requires a recount", async () => {
    let doc = await capture(await create(), 80);
    await physical("inv_ing_plain", 10);
    await physical("inv_ing_plain", -10);
    await expect(service.apply(scope(doc))).rejects.toMatchObject({
      code: "inventoryCount.stockChanged",
    });
    doc = await service.refresh({ ...scope(doc), inventoryItemIds: ["inv_ing_plain"] });
    expect(row(doc, "inv_ing_plain")).toMatchObject({
      countedQuantity: null,
      previousCountedQuantity: 80,
      systemQuantity: 92,
    });
    await expect(service.apply(scope(doc))).rejects.toMatchObject({ code: "inventoryCount.empty" });
    doc = await capture(doc, 80);
    expect((await service.apply(scope(doc))).status).toBe("applied");
  });
  it("ignores reservation-only changes and preserves reservations below the counted physical quantity", async () => {
    const doc = await capture(await create(), 2);
    await pool.query("UPDATE inventory_balance SET reserved_quantity=5 WHERE lot_id='plain-lot'");
    const applied = await service.apply(scope(doc));
    expect(applied.items[0]!.reservedQuantity).toBe(5);
    expect(
      (
        await pool.query(
          "SELECT on_hand_quantity::float AS physical, reserved_quantity::float AS reserved FROM inventory_balance WHERE lot_id='plain-lot'",
        )
      ).rows[0],
    ).toEqual({ physical: 2, reserved: 5 });
  });
  it("registers an expired found lot only when applying and enforces the global lot expiration", async () => {
    let doc = await create(["inv_ing_milk"]);
    doc = await service.addLot({
      ...scope(doc),
      inventoryItemId: "inv_ing_milk",
      lotCode: "EXPIRED",
      expiresOn: "2020-01-01",
    });
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM inventory_lot WHERE normalized_lot_code='expired'",
        )
      ).rows[0].n,
    ).toBe(0);
    doc = await service.save({
      ...scope(doc),
      lines: [
        { id: doc.items[0]!.lines.find((l) => l.lotCode === "EXPIRED")!.id, countedQuantity: 4 },
      ],
    });
    await service.apply(scope(doc));
    expect(
      (
        await pool.query(
          "SELECT expires_on::text AS expires FROM inventory_lot WHERE normalized_lot_code='expired'",
        )
      ).rows[0].expires,
    ).toBe("2020-01-01");
    await expect(
      service.addLot({
        ...scope(await create(["inv_ing_milk"])),
        inventoryItemId: "inv_ing_milk",
        lotCode: " expired ",
        expiresOn: "2020-01-01",
      }),
    ).rejects.toMatchObject({ code: "inventoryCount.duplicateLot" });
  });
  it("rejects stale saves, foreign lines and cross-location access", async () => {
    const a = await create();
    const b = await create();
    await expect(
      service.save({
        ...scope(a),
        lines: [{ id: row(b, "inv_ing_plain").id, countedQuantity: 0 }],
      }),
    ).rejects.toMatchObject({ code: "inventoryCount.invalidLine" });
    await capture(a, 1);
    await expect(capture(a, 3)).rejects.toMatchObject({ code: "inventoryCount.staleVersion" });
    await expect(service.get({ ...scope(a), locationId: "other-loc" })).rejects.toMatchObject({
      code: "inventory.locationAccessDenied",
    });
    await expect(
      service.get({ ...scope(a), userId: "owner", locationId: "other-loc" }),
    ).rejects.toMatchObject({ code: "inventoryCount.notFound" });
  });
  it("cancels a draft without changing stock and rejects later writes", async () => {
    const doc = await create();
    const cancelled = await service.cancel(scope(doc));
    expect(cancelled.status).toBe("cancelled");
    await expect(service.apply(scope(cancelled))).rejects.toMatchObject({
      code: "inventoryCount.notDraft",
    });
  });
  it("serializes duplicate application requests", async () => {
    const doc = await capture(await create(["inv_ing_other"]), 15, "inv_ing_other");
    const results = await Promise.all([service.apply(scope(doc)), service.apply(scope(doc))]);
    expect(results[0]!.movementId).toBe(results[1]!.movementId);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM inventory_movement_line WHERE movement_id=$1",
          [results[0]!.movementId],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it("does not apply against an in-flight writer and can retry after it commits", async () => {
    const doc = await capture(await create(), 1);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE inventory_balance SET on_hand_quantity=on_hand_quantity+1 WHERE lot_id='plain-lot'",
      );
      await expect(service.apply(scope(doc))).rejects.toMatchObject({
        code: "inventoryCount.busy",
      });
      await client.query("COMMIT");
      await expect(service.apply(scope(doc))).rejects.toMatchObject({
        code: "inventoryCount.stockChanged",
      });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
  it("rolls back every line when a later line fails validation", async () => {
    let doc = await create(["inv_ing_plain", "inv_ing_milk"]);
    doc = await service.addLot({
      ...scope(doc),
      inventoryItemId: "inv_ing_milk",
      lotCode: "CONFLICT",
      expiresOn: "2021-01-01",
    });
    // An independently registered global lot with a contradictory expiration.
    await pool.query(
      "INSERT INTO inventory_lot (id,inventory_item_id,lot_code,normalized_lot_code,internal_batch_key,expires_on) VALUES ('conflict-lot','inv_ing_milk','CONFLICT','conflict','lot:conflict','2022-01-01')",
    );
    doc = await service.save({
      ...scope(doc),
      lines: [
        { id: row(doc, "inv_ing_plain").id, countedQuantity: 0 },
        {
          id: doc.items
            .find((i) => i.inventoryItemId === "inv_ing_milk")!
            .lines.find((l) => l.lotCode === "CONFLICT")!.id,
          countedQuantity: 3,
        },
      ],
    });
    const before = (
      await pool.query("SELECT on_hand_quantity FROM inventory_balance WHERE lot_id='plain-lot'")
    ).rows[0].on_hand_quantity;
    await expect(service.apply(scope(doc))).rejects.toMatchObject({
      code: "inventory.lotExpirationMismatch",
    });
    expect(
      (await pool.query("SELECT on_hand_quantity FROM inventory_balance WHERE lot_id='plain-lot'"))
        .rows[0].on_hand_quantity,
    ).toBe(before);
    expect((await service.get(scope(doc))).status).toBe("draft");
  });
  it("merges a found draft lot with a newly received lot when refreshing its reference", async () => {
    let doc = await create(["inv_ing_milk"]);
    doc = await service.addLot({
      ...scope(doc),
      inventoryItemId: "inv_ing_milk",
      lotCode: "FOUND",
      expiresOn: "2099-01-02",
    });
    const found = doc.items[0]!.lines.find((l) => l.lotCode === "FOUND")!;
    doc = await service.save({ ...scope(doc), lines: [{ id: found.id, countedQuantity: 6 }] });
    await pool.query(
      "INSERT INTO inventory_lot (id,inventory_item_id,lot_code,normalized_lot_code,internal_batch_key,expires_on) VALUES ('found-lot','inv_ing_milk','FOUND','found','lot:found','2099-01-02')",
    );
    await pool.query(
      "INSERT INTO inventory_balance (location_id,inventory_item_id,lot_id,on_hand_quantity) VALUES ('loc','inv_ing_milk','found-lot',6)",
    );
    doc = await service.refresh({ ...scope(doc), inventoryItemIds: ["inv_ing_milk"] });
    const matching = doc.items[0]!.lines.filter((l) => l.lotCode === "FOUND");
    expect(matching).toHaveLength(1);
    expect(matching[0]).toMatchObject({
      lotId: "found-lot",
      systemQuantity: 6,
      countedQuantity: null,
      previousCountedQuantity: 6,
    });
  });
  it("does not create movements for a counted unchanged quantity", async () => {
    const current = Number(
      (await pool.query("SELECT on_hand_quantity FROM inventory_balance WHERE lot_id='other-lot'"))
        .rows[0].on_hand_quantity,
    );
    const doc = await capture(await create(["inv_ing_other"]), current, "inv_ing_other");
    expect((await service.apply(scope(doc))).movementId).toBeNull();
  });
  it("applies zero physically and preserves pending reservations", async () => {
    const doc = await capture(await create(), 0);
    await service.apply(scope(doc));
    expect(
      (
        await pool.query(
          "SELECT on_hand_quantity::float AS physical, reserved_quantity::float AS reserved FROM inventory_balance WHERE lot_id='plain-lot'",
        )
      ).rows[0],
    ).toEqual({ physical: 0, reserved: 5 });
  });
  it("blocks new reservations on the article even if another lot still has available stock", async () => {
    await pool.query(
      "INSERT INTO inventory_lot (id,inventory_item_id,internal_batch_key) VALUES ('plain-free','inv_ing_plain','free')",
    );
    await pool.query(
      "INSERT INTO inventory_balance (location_id,inventory_item_id,lot_id,on_hand_quantity) VALUES ('loc','inv_ing_plain','plain-free',10)",
    );
    const blocked = await db.transaction((tx) =>
      loadReservableBalances(tx, "loc", "inv_ing_plain", "2026-11-04"),
    );
    expect(blocked.rows).toHaveLength(0);
    await pool.query("UPDATE inventory_balance SET reserved_quantity=0 WHERE lot_id='plain-lot'");
    const available = await db.transaction((tx) =>
      loadReservableBalances(tx, "loc", "inv_ing_plain", "2026-11-04"),
    );
    expect(available.rows).toHaveLength(1);
  });
  it("rolls back earlier successful deltas when a later article has invalid base-unit precision", async () => {
    let doc = await create(["inv_ing_milk", "inv_ing_plain"]);
    const milkLine = doc.items
      .find((i) => i.inventoryItemId === "inv_ing_milk")!
      .lines.find((l) => l.lotId === "milk-lot")!;
    doc = await service.save({
      ...scope(doc),
      lines: [
        { id: milkLine.id, countedQuantity: 9 },
        { id: row(doc, "inv_ing_plain").id, countedQuantity: 1 },
      ],
    });
    // Simulate old/bad persisted input to verify apply revalidates independently.
    await pool.query("UPDATE inventory_count_line SET counted_quantity=0.5 WHERE id=$1", [
      row(doc, "inv_ing_plain").id,
    ]);
    const before = (
      await pool.query("SELECT on_hand_quantity FROM inventory_balance WHERE lot_id='milk-lot'")
    ).rows[0].on_hand_quantity;
    await expect(service.apply(scope(doc))).rejects.toMatchObject({
      code: "inventoryCount.invalidQuantity",
    });
    expect(
      (await pool.query("SELECT on_hand_quantity FROM inventory_balance WHERE lot_id='milk-lot'"))
        .rows[0].on_hand_quantity,
    ).toBe(before);
    expect((await service.get(scope(doc))).status).toBe("draft");
  });
  it("counts anonymous perishable partitions once per expiration and preserves reservations", async () => {
    await pool.query(
      "INSERT INTO ingredient (id,name,base_unit_id,category_id,base_cost_per_unit,is_inventory_tracked,tracks_lots,is_perishable) VALUES ('anon','Sin código','pcs','test',0,true,false,true)",
    );
    // The service materializes the inventory item from the source catalog.
    let doc = await create(["inv_ing_anon"]);
    doc = await service.addLot({
      ...scope(doc),
      inventoryItemId: "inv_ing_anon",
      expiresOn: "2099-04-01",
    });
    await pool.query(
      "INSERT INTO inventory_lot (id,inventory_item_id,internal_batch_key,expires_on) VALUES ('anon-a','inv_ing_anon','a','2099-04-01'),('anon-b','inv_ing_anon','b','2099-04-01')",
    );
    await pool.query(
      "INSERT INTO inventory_balance (location_id,inventory_item_id,lot_id,on_hand_quantity,reserved_quantity) VALUES ('loc','inv_ing_anon','anon-a',5,0),('loc','inv_ing_anon','anon-b',7,3)",
    );
    doc = await service.refresh({ ...scope(doc), inventoryItemIds: ["inv_ing_anon"] });
    expect(doc.items[0]!.lines).toHaveLength(1);
    expect(doc.items[0]!.lines[0]!.systemQuantity).toBe(12);
    doc = await capture(doc, 6, "inv_ing_anon");
    await service.apply(scope(doc));
    const stock = (
      await pool.query(
        "SELECT sum(on_hand_quantity)::float AS physical,sum(reserved_quantity)::float AS reserved FROM inventory_balance WHERE inventory_item_id='inv_ing_anon'",
      )
    ).rows[0];
    expect(stock).toEqual({ physical: 6, reserved: 3 });
  });
});
