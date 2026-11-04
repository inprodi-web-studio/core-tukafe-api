import {
  inventoryBalancesDB,
  inventoryCountItemsDB,
  inventoryCountLinesDB,
  inventoryCountsDB,
  inventoryLocationItemsDB,
  inventoryLotsDB,
  inventoryMovementLinesDB,
  inventoryMovementsDB,
  inventoryStockRevisionsDB,
  userDB,
} from "@core/db/schemas";
import { conflict, generateNanoId, getPgError, notFound, validation } from "@core/utils";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  assertLocationAccess,
  ensureInventoryCatalog,
  listInventoryItemRows,
  mapInventoryItem,
} from "../inventory.service";
import {
  countConfigurationMatches,
  distributeCount,
  countLineKey,
  groupCountBalances,
  normalizeCountLot,
  roundCountQuantity,
  validateCountLot,
  validateCountQuantity,
} from "./counts.helpers";
import type { CountDetail, CountSummary } from "./counts.schemas";
import type {
  AdminInventoryCountsService,
  CountContext,
  CountLocationContext,
} from "./counts.types";

type Tx = Parameters<Parameters<FastifyInstance["db"]["transaction"]>[0]>[0];
type Db = FastifyInstance["db"] | Tx;
type Header = typeof inventoryCountsDB.$inferSelect;
type CountItem = typeof inventoryCountItemsDB.$inferSelect;
type CountLine = typeof inventoryCountLinesDB.$inferSelect;

function mapCountError(error: unknown): never {
  const pg = getPgError(error);
  if (pg?.code === "55P03" || pg?.code === "40P01")
    throw conflict(
      "inventoryCount.busy",
      "Hay movimientos en curso. Intenta nuevamente cuando terminen",
    );
  if (pg?.code === "23505")
    throw conflict("inventoryCount.duplicateLot", "Ese lote ya está registrado. Recarga el conteo");
  throw error;
}

/** A short barrier shared with all existing INSERT/UPDATE/DELETE writers in PostgreSQL.
 * It prevents phantom lots and check/write races without requiring every client to opt in.
 * Acquire before touching any balance. Do not hold it during user capture or review.
 */
async function lockPhysicalStock(tx: Tx) {
  await tx.execute(sql`set local lock_timeout = '5s'`);
  // NOWAIT also rejects existing SELECT FOR UPDATE holders, avoiding lock-upgrade
  // deadlocks with sales. Ordinary read-only stock queries remain available.
  await tx.execute(sql`lock table inventory_balance in exclusive mode nowait`);
}

async function lockCountConfiguration(tx: Tx) {
  await tx.execute(
    sql`select ii.id from inventory_item ii inner join unit u on u.id = ii.base_unit_id for share of ii, u`,
  );
}

async function header(db: Db, input: CountContext, lock = false) {
  const query = db
    .select()
    .from(inventoryCountsDB)
    .where(
      and(
        eq(inventoryCountsDB.id, input.countId),
        eq(inventoryCountsDB.locationId, input.locationId),
      ),
    );
  const [row] = lock ? await query.for("update") : await query;
  if (!row) throw notFound("inventoryCount.notFound", "No se encontró el conteo en esta ubicación");
  return row;
}

function assertDraft(row: Header, version: number) {
  if (row.status !== "draft")
    throw conflict("inventoryCount.notDraft", "Solo se pueden modificar conteos en borrador");
  if (row.version !== version)
    throw conflict(
      "inventoryCount.staleVersion",
      "Otra persona modificó el conteo. Recarga antes de continuar",
    );
}

async function summarize(db: Db, row: Header): Promise<CountSummary> {
  const ids = [row.createdByUserId, row.appliedByUserId, row.cancelledByUserId].filter(
    (id): id is string => Boolean(id),
  );
  const users = await db
    .select({ id: userDB.id, name: userDB.name })
    .from(userDB)
    .where(inArray(userDB.id, ids));
  const actor = (id: string | null) =>
    id ? (users.find((u) => u.id === id) ?? { id, name: "Usuario" }) : null;
  return {
    id: row.id,
    locationId: row.locationId,
    status: row.status,
    version: row.version,
    observations: row.observations,
    movementId: row.movementId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: actor(row.createdByUserId)!,
    appliedBy: actor(row.appliedByUserId),
    cancelledBy: actor(row.cancelledByUserId),
    appliedAt: row.appliedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
  };
}

async function itemState(db: Db, locationId: string) {
  const revisions = await db
    .select()
    .from(inventoryStockRevisionsDB)
    .where(eq(inventoryStockRevisionsDB.locationId, locationId));
  const catalog = (await listInventoryItemRows(db)).map(mapInventoryItem);
  return {
    revisions: new Map(revisions.map((r) => [r.inventoryItemId, r.revision])),
    catalog: new Map(catalog.map((i) => [i.id, i])),
  };
}

async function balances(db: Db, locationId: string, inventoryItemId: string) {
  return db
    .select({
      lotId: inventoryLotsDB.id,
      lotCode: inventoryLotsDB.lotCode,
      expiresOn: inventoryLotsDB.expiresOn,
      onHandQuantity: inventoryBalancesDB.onHandQuantity,
      reservedQuantity: inventoryBalancesDB.reservedQuantity,
    })
    .from(inventoryBalancesDB)
    .innerJoin(inventoryLotsDB, eq(inventoryLotsDB.id, inventoryBalancesDB.lotId))
    .where(
      and(
        eq(inventoryBalancesDB.locationId, locationId),
        eq(inventoryBalancesDB.inventoryItemId, inventoryItemId),
      ),
    )
    .orderBy(asc(inventoryLotsDB.createdAt), asc(inventoryLotsDB.id));
}

async function readDetail(db: Db, input: CountContext): Promise<CountDetail> {
  const row = await header(db, input);
  const items = await db
    .select()
    .from(inventoryCountItemsDB)
    .where(eq(inventoryCountItemsDB.countId, row.id))
    .orderBy(asc(inventoryCountItemsDB.id));
  const lines = items.length
    ? await db
        .select()
        .from(inventoryCountLinesDB)
        .where(
          inArray(
            inventoryCountLinesDB.countItemId,
            items.map((i) => i.id),
          ),
        )
        .orderBy(asc(inventoryCountLinesDB.id))
    : [];
  const state = row.status === "draft" ? await itemState(db, input.locationId) : null;
  const reservedResult = await db.execute(sql`select inventory_item_id as "inventoryItemId",
    sum(reserved_quantity) as reserved from inventory_balance where location_id = ${input.locationId} group by inventory_item_id`);
  const reservedByItem = new Map(
    (reservedResult.rows as Array<{ inventoryItemId: string; reserved: string }>).map((r) => [
      r.inventoryItemId,
      Number(r.reserved),
    ]),
  );
  return {
    ...(await summarize(db, row)),
    items: await Promise.all(
      items
        .sort((a, b) => a.snapshot.name.localeCompare(b.snapshot.name) || a.id.localeCompare(b.id))
        .map(async (item) => ({
          id: item.id,
          inventoryItemId: item.inventoryItemId,
          snapshot: item.snapshot,
          referenceAt: item.referenceAt.toISOString(),
          hasConflict: Boolean(
            state &&
            (item.stockRevision !== (state.revisions.get(item.inventoryItemId) ?? 0) ||
              !countConfigurationMatches(item.snapshot, state.catalog.get(item.inventoryItemId))),
          ),
          reservedQuantity: reservedByItem.get(item.inventoryItemId) ?? 0,
          lines: lines
            .filter((l) => l.countItemId === item.id)
            .map(({ countItemId: _parent, ...line }) => line),
        })),
    ),
  };
}

async function snapshotLines(tx: Tx, input: CountLocationContext, item: CountItem, reset: boolean) {
  const stock = await balances(tx, input.locationId, item.inventoryItemId);
  const existing = await tx
    .select()
    .from(inventoryCountLinesDB)
    .where(eq(inventoryCountLinesDB.countItemId, item.id));
  if (reset) {
    for (const line of existing)
      await tx
        .update(inventoryCountLinesDB)
        .set({
          previousCountedQuantity: line.countedQuantity ?? line.previousCountedQuantity,
          countedQuantity: null,
          systemQuantity: 0,
        })
        .where(eq(inventoryCountLinesDB.id, line.id));
  }
  const refs = groupCountBalances(item.snapshot, stock);
  for (const ref of refs) {
    const line =
      existing.find((l) => countLineKey(item.snapshot, l) === countLineKey(item.snapshot, ref)) ??
      existing.find(
        (l) =>
          l.lotId === null &&
          (ref.lotCode
            ? normalizeCountLot(l.lotCode).normalizedLotCode ===
              normalizeCountLot(ref.lotCode).normalizedLotCode
            : l.lotCode === null && l.expiresOn === ref.expiresOn),
      );
    if (line)
      await tx
        .update(inventoryCountLinesDB)
        .set({
          lotId: ref.lotId,
          lotCode: ref.lotCode,
          expiresOn: ref.expiresOn,
          systemQuantity: ref.onHandQuantity,
        })
        .where(eq(inventoryCountLinesDB.id, line.id));
    else
      await tx.insert(inventoryCountLinesDB).values({
        id: generateNanoId(),
        countItemId: item.id,
        lotId: ref.lotId,
        lotCode: ref.lotCode,
        expiresOn: ref.expiresOn,
        systemQuantity: ref.onHandQuantity,
      });
  }
  // Draft-only found lots are retained, but reset for a fresh physical recount.
}

async function bumpVersion(tx: Tx, row: Header) {
  await tx
    .update(inventoryCountsDB)
    .set({ version: row.version + 1, updatedAt: new Date() })
    .where(eq(inventoryCountsDB.id, row.id));
}

async function resolveCountLot(tx: Tx, item: CountItem, line: CountLine) {
  if (line.lotId) return line.lotId;
  const grouped = !item.snapshot.tracksLots && !item.snapshot.isPerishable;
  const { lotCode, normalizedLotCode } = normalizeCountLot(line.lotCode);
  if (!grouped) validateCountLot(item.snapshot, lotCode, line.expiresOn);
  // A row lock on the article also serializes global lot-code creation across locations.
  await tx.execute(
    sql`select id from inventory_item where id = ${item.inventoryItemId} for update`,
  );
  if (normalizedLotCode) {
    const [existing] = await tx
      .select()
      .from(inventoryLotsDB)
      .where(
        and(
          eq(inventoryLotsDB.inventoryItemId, item.inventoryItemId),
          eq(inventoryLotsDB.normalizedLotCode, normalizedLotCode),
        ),
      );
    if (existing) {
      if (existing.expiresOn !== line.expiresOn)
        throw conflict(
          "inventory.lotExpirationMismatch",
          "El lote ya existe con otra fecha de caducidad",
        );
      return existing.id;
    }
  }
  const id = generateNanoId();
  await tx.insert(inventoryLotsDB).values({
    id,
    inventoryItemId: item.inventoryItemId,
    lotCode,
    normalizedLotCode,
    expiresOn: line.expiresOn,
    internalBatchKey: normalizedLotCode ? `lot:${normalizedLotCode}` : id,
  });
  return id;
}

async function applyLotDelta(
  tx: Tx,
  input: CountContext,
  movementId: string,
  inventoryItemId: string,
  lotId: string,
  delta: number,
) {
  if (delta === 0) return;
  await tx
    .insert(inventoryLocationItemsDB)
    .values({ locationId: input.locationId, inventoryItemId })
    .onConflictDoNothing();
  await tx
    .insert(inventoryBalancesDB)
    .values({ locationId: input.locationId, inventoryItemId, lotId })
    .onConflictDoNothing();
  const [balance] = await tx
    .update(inventoryBalancesDB)
    .set({
      onHandQuantity: sql`${inventoryBalancesDB.onHandQuantity} + ${delta}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(inventoryBalancesDB.locationId, input.locationId),
        eq(inventoryBalancesDB.inventoryItemId, inventoryItemId),
        eq(inventoryBalancesDB.lotId, lotId),
      ),
    )
    .returning();
  await tx.insert(inventoryMovementLinesDB).values({
    id: generateNanoId(),
    movementId,
    inventoryItemId,
    lotId,
    onHandDelta: delta,
    reservedDelta: 0,
    onHandAfter: balance!.onHandQuantity,
    reservedAfter: balance!.reservedQuantity,
  });
}

export function adminInventoryCountsService(fastify: FastifyInstance): AdminInventoryCountsService {
  async function mutate(
    input: CountContext & { version: number },
    operation: (tx: Tx, row: Header) => Promise<void>,
    idempotentApply = false,
  ) {
    try {
      return await fastify.db.transaction(async (tx) => {
        await assertLocationAccess(tx, input);
        const row = await header(tx, input, true);
        if (idempotentApply && row.status === "applied") return readDetail(tx, input);
        assertDraft(row, input.version);
        await operation(tx, row);
        await bumpVersion(tx, row);
        return readDetail(tx, input);
      });
    } catch (error) {
      return mapCountError(error);
    }
  }
  return {
    async list(input) {
      await assertLocationAccess(fastify.db, input);
      const where = and(
        eq(inventoryCountsDB.locationId, input.locationId),
        input.status ? eq(inventoryCountsDB.status, input.status) : undefined,
      );
      const [totals] = await fastify.db
        .select({ total: sql<number>`count(*)::int` })
        .from(inventoryCountsDB)
        .where(where);
      const rows = await fastify.db
        .select()
        .from(inventoryCountsDB)
        .where(where)
        .orderBy(desc(inventoryCountsDB.createdAt), asc(inventoryCountsDB.id))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);
      return {
        data: await Promise.all(rows.map((r) => summarize(fastify.db, r))),
        pagination: {
          page: input.page,
          pageSize: input.pageSize,
          totalItems: totals!.total,
          totalPages: Math.ceil(totals!.total / input.pageSize),
        },
      };
    },
    async create(input) {
      await assertLocationAccess(fastify.db, input);
      await ensureInventoryCatalog(fastify.db);
      return fastify.db
        .transaction(async (tx) => {
          await assertLocationAccess(tx, input);
          await lockPhysicalStock(tx);
          await lockCountConfiguration(tx);
          const state = await itemState(tx, input.locationId);
          const selected = input.inventoryItemIds ? new Set(input.inventoryItemIds) : null;
          const items = [...state.catalog.values()].filter(
            (i) => i.isTracked && (!selected || selected.has(i.id)),
          );
          if (!items.length || (selected && selected.size !== items.length))
            throw validation(
              "inventoryCount.invalidItems",
              "Selecciona artículos con control de inventario activos",
            );
          const id = generateNanoId();
          await tx.insert(inventoryCountsDB).values({
            id,
            locationId: input.locationId,
            createdByUserId: input.userId,
            observations: input.observations?.trim() || null,
          });
          const countItems = items.map((snapshot) => ({
            id: generateNanoId(),
            countId: id,
            inventoryItemId: snapshot.id,
            snapshot,
            stockRevision: state.revisions.get(snapshot.id) ?? 0,
            referenceAt: new Date(),
          }));
          const stockResult =
            await tx.execute(sql`select b.inventory_item_id as "inventoryItemId", b.lot_id as "lotId", l.lot_code as "lotCode", l.expires_on::text as "expiresOn", b.on_hand_quantity as quantity
          from inventory_balance b inner join inventory_lot l on l.id = b.lot_id where b.location_id = ${input.locationId} order by b.inventory_item_id, l.created_at, l.id`);
          const stock = stockResult.rows as Array<{
            inventoryItemId: string;
            lotId: string;
            lotCode: string | null;
            expiresOn: string | null;
            quantity: string;
          }>;
          const lines: Array<typeof inventoryCountLinesDB.$inferInsert> = [];
          for (const item of countItems) {
            const rows = stock.filter((s) => s.inventoryItemId === item.inventoryItemId);
            for (const lot of groupCountBalances(
              item.snapshot,
              rows.map((s) => ({ ...s, onHandQuantity: Number(s.quantity) })),
            ))
              lines.push({
                id: generateNanoId(),
                countItemId: item.id,
                lotId: lot.lotId,
                lotCode: lot.lotCode,
                expiresOn: lot.expiresOn,
                systemQuantity: lot.onHandQuantity,
              });
          }
          if (countItems.length > 5000 || lines.length > 10000)
            throw validation(
              "inventoryCount.tooLarge",
              "Selecciona menos artículos para este conteo",
            );
          for (let offset = 0; offset < countItems.length; offset += 500)
            await tx.insert(inventoryCountItemsDB).values(countItems.slice(offset, offset + 500));
          for (let offset = 0; offset < lines.length; offset += 500)
            await tx.insert(inventoryCountLinesDB).values(lines.slice(offset, offset + 500));
          return readDetail(tx, { ...input, countId: id });
        })
        .catch(mapCountError);
    },
    async get(input) {
      await assertLocationAccess(fastify.db, input);
      return readDetail(fastify.db, input);
    },
    async save(input) {
      return mutate(input, async (tx, row) => {
        const items = await tx
          .select()
          .from(inventoryCountItemsDB)
          .where(eq(inventoryCountItemsDB.countId, row.id));
        const allLines = await tx
          .select()
          .from(inventoryCountLinesDB)
          .where(
            inArray(
              inventoryCountLinesDB.countItemId,
              items.map((i) => i.id),
            ),
          );
        const seen = new Set<string>();
        for (const patch of input.lines) {
          const line = allLines.find((l) => l.id === patch.id);
          if (!line || seen.has(patch.id))
            throw validation(
              "inventoryCount.invalidLine",
              "La línea no pertenece al conteo o está repetida",
            );
          seen.add(patch.id);
          const item = items.find((i) => i.id === line.countItemId)!;
          validateCountQuantity(patch.countedQuantity, item.snapshot.unit.precision);
          await tx
            .update(inventoryCountLinesDB)
            .set({ countedQuantity: patch.countedQuantity })
            .where(eq(inventoryCountLinesDB.id, patch.id));
        }
        if (input.observations !== undefined)
          await tx
            .update(inventoryCountsDB)
            .set({ observations: input.observations?.trim() || null })
            .where(eq(inventoryCountsDB.id, row.id));
      });
    },
    async addLot(input) {
      return mutate(input, async (tx, row) => {
        const [item] = await tx
          .select()
          .from(inventoryCountItemsDB)
          .where(
            and(
              eq(inventoryCountItemsDB.countId, row.id),
              eq(inventoryCountItemsDB.inventoryItemId, input.inventoryItemId),
            ),
          );
        if (!item)
          throw notFound("inventoryCount.itemNotFound", "El artículo no pertenece al conteo");
        const { lotCode, normalizedLotCode } = normalizeCountLot(input.lotCode);
        validateCountLot(item.snapshot, lotCode, input.expiresOn ?? null);
        const lines = await tx
          .select()
          .from(inventoryCountLinesDB)
          .where(eq(inventoryCountLinesDB.countItemId, item.id));
        if (
          lines.some((l) =>
            normalizedLotCode
              ? normalizeCountLot(l.lotCode).normalizedLotCode === normalizedLotCode
              : !l.lotCode && l.expiresOn === (input.expiresOn ?? null),
          )
        )
          throw conflict("inventoryCount.duplicateLot", "El lote ya aparece en el conteo");
        await tx.insert(inventoryCountLinesDB).values({
          id: generateNanoId(),
          countItemId: item.id,
          lotCode,
          expiresOn: input.expiresOn ?? null,
          systemQuantity: 0,
        });
      });
    },
    async refresh(input) {
      return mutate(input, async (tx, row) => {
        await lockPhysicalStock(tx);
        await lockCountConfiguration(tx);
        const state = await itemState(tx, input.locationId);
        const items = await tx
          .select()
          .from(inventoryCountItemsDB)
          .where(
            and(
              eq(inventoryCountItemsDB.countId, row.id),
              inArray(inventoryCountItemsDB.inventoryItemId, [...new Set(input.inventoryItemIds)]),
            ),
          );
        if (items.length !== new Set(input.inventoryItemIds).size)
          throw validation("inventoryCount.invalidItems", "El artículo no pertenece al conteo");
        for (const item of items) {
          const current = state.catalog.get(item.inventoryItemId);
          if (!countConfigurationMatches(item.snapshot, current))
            throw conflict(
              "inventoryCount.configurationChanged",
              "Cambió la configuración del artículo. Inicia otro conteo para este artículo",
            );
          await snapshotLines(tx, input, item, true);
          await tx
            .update(inventoryCountItemsDB)
            .set({
              stockRevision: state.revisions.get(item.inventoryItemId) ?? 0,
              referenceAt: new Date(),
            })
            .where(eq(inventoryCountItemsDB.id, item.id));
        }
      });
    },
    async apply(input) {
      return mutate(
        input,
        async (tx, row) => {
          await lockPhysicalStock(tx);
          await lockCountConfiguration(tx);
          const detail = await readDetail(tx, input);
          const selected = detail.items.filter((i) =>
            i.lines.some((l) => l.countedQuantity !== null),
          );
          if (!selected.length)
            throw validation(
              "inventoryCount.empty",
              "Captura al menos una cantidad, incluso si es cero",
            );
          const conflicting = selected.filter((i) => i.hasConflict);
          if (conflicting.length)
            throw conflict(
              "inventoryCount.stockChanged",
              "Hubo movimientos posteriores. Actualiza la referencia y vuelve a contar los artículos indicados",
              { inventoryItemIds: conflicting.map((i) => i.inventoryItemId) },
            );
          const items = await tx
            .select()
            .from(inventoryCountItemsDB)
            .where(eq(inventoryCountItemsDB.countId, row.id));
          const lines = await tx
            .select()
            .from(inventoryCountLinesDB)
            .where(
              inArray(
                inventoryCountLinesDB.countItemId,
                items.map((i) => i.id),
              ),
            )
            .orderBy(asc(inventoryCountLinesDB.id));
          const movementId = generateNanoId();
          let hasChanges = false;
          for (const item of items.sort((a, b) =>
            a.inventoryItemId.localeCompare(b.inventoryItemId),
          )) {
            for (const line of lines.filter(
              (l) => l.countItemId === item.id && l.countedQuantity !== null,
            )) {
              const counted = line.countedQuantity!;
              validateCountQuantity(counted, item.snapshot.unit.precision);
              const delta = roundCountQuantity(counted - line.systemQuantity);
              if (delta !== 0 && !hasChanges) {
                await tx.insert(inventoryMovementsDB).values({
                  id: movementId,
                  locationId: input.locationId,
                  type: "physical_count",
                  actorUserId: input.userId,
                });
                hasChanges = true;
              }
              if (delta !== 0) {
                const grouped = !item.snapshot.tracksLots;
                if (grouped) {
                  let stock = (await balances(tx, input.locationId, item.inventoryItemId)).filter(
                    (b) => countLineKey(item.snapshot, b) === countLineKey(item.snapshot, line),
                  );
                  if (!stock.length) {
                    const lotId = await resolveCountLot(tx, item, line);
                    stock = [
                      {
                        lotId,
                        lotCode: line.lotCode,
                        expiresOn: line.expiresOn,
                        onHandQuantity: 0,
                        reservedQuantity: 0,
                      },
                    ];
                  }
                  for (const target of distributeCount(counted, stock))
                    await applyLotDelta(
                      tx,
                      input,
                      movementId,
                      item.inventoryItemId,
                      target.lotId,
                      roundCountQuantity(target.target - target.onHandQuantity),
                    );
                } else {
                  const lotId = await resolveCountLot(tx, item, line);
                  await applyLotDelta(tx, input, movementId, item.inventoryItemId, lotId, delta);
                  await tx
                    .update(inventoryCountLinesDB)
                    .set({ lotId })
                    .where(eq(inventoryCountLinesDB.id, line.id));
                }
              }
              await tx
                .update(inventoryCountLinesDB)
                .set({ appliedDelta: delta })
                .where(eq(inventoryCountLinesDB.id, line.id));
            }
          }
          await tx
            .update(inventoryCountsDB)
            .set({
              status: "applied",
              appliedAt: new Date(),
              appliedByUserId: input.userId,
              movementId: hasChanges ? movementId : null,
            })
            .where(eq(inventoryCountsDB.id, row.id));
        },
        true,
      );
    },
    async cancel(input) {
      return mutate(input, async (tx, row) => {
        await tx
          .update(inventoryCountsDB)
          .set({ status: "cancelled", cancelledAt: new Date(), cancelledByUserId: input.userId })
          .where(eq(inventoryCountsDB.id, row.id));
      });
    },
  };
}
