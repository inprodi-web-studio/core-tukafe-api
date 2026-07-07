import fs from "node:fs/promises";
import path from "node:path";

import { db, pool } from "@core/db";
import {
  productCompoundComponentsDB,
  productCompoundSlotOptionsDB,
  productCompoundSlotsDB,
} from "@core/db/schemas";
import { generateNanoId } from "@core/utils";
import { inArray } from "drizzle-orm";

interface CsvRow {
  __line: number;
  [key: string]: string | number;
}

interface CsvTable {
  fileName: string;
  filePath: string;
  headers: string[];
  rows: CsvRow[];
}

interface SyncRow {
  line: number;
  compoundProductId: string;
  compoundProductName: string;
  componentProductId: string;
  componentProductName: string;
  quantity: number;
  slotName: string;
  slotSortOrder: number;
  optionSortOrder: number;
  label: string | null;
}

function cleanText(value: unknown): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim();
}

function canonicalize(value: string): string {
  return cleanText(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function parseCsv(content: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const text = content.replace(/^\uFEFF/, "");

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        const nextChar = text[index + 1];
        if (nextChar === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    if (char !== "\r") {
      field += char;
    }
  }

  row.push(field);
  rows.push(row);

  const headers = (rows[0] ?? []).map((cell) => cleanText(cell));
  const records: CsvRow[] = [];

  for (let index = 1; index < rows.length; index += 1) {
    const raw = rows[index] ?? [];
    if (raw.every((value) => cleanText(value).length === 0)) {
      continue;
    }

    const record = { __line: index + 1 } as CsvRow;
    for (let col = 0; col < headers.length; col += 1) {
      const header = headers[col] ?? `col_${col + 1}`;
      record[header] = cleanText(raw[col]);
    }
    records.push(record);
  }

  return { headers, records };
}

function decodeCsvBuffer(raw: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    try {
      return new TextDecoder("macintosh").decode(raw);
    } catch {
      return raw.toString("utf8");
    }
  }
}

async function loadCsvTable(csvDir: string, fileName: string): Promise<CsvTable> {
  const filePath = path.join(csvDir, fileName);
  const raw = await fs.readFile(filePath);
  const parsed = parseCsv(decodeCsvBuffer(raw));

  return {
    fileName,
    filePath,
    headers: parsed.headers,
    rows: parsed.records,
  };
}

function getCell(table: CsvTable, row: CsvRow, key: string, required = false): string {
  if (!(key in row)) {
    throw new Error(`Falta la columna "${key}" en ${table.fileName}.`);
  }

  const value = cleanText(row[key]);
  if (required && value.length === 0) {
    throw new Error(`Campo requerido vacío: ${table.fileName}:${row.__line} columna "${key}".`);
  }

  return value;
}

function hasColumn(table: CsvTable, key: string): boolean {
  return table.headers.includes(key);
}

function parsePositiveInteger(value: string, context: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${context} debe ser un entero positivo.`);
  }

  return parsed;
}

function parseNonNegativeInteger(value: string, context: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${context} debe ser un entero mayor o igual a 0.`);
  }

  return parsed;
}

function buildLookup<T extends { name: string }>(items: T[], label: string): Map<string, T> {
  const lookup = new Map<string, T>();

  for (const item of items) {
    const key = canonicalize(item.name);
    if (lookup.has(key)) {
      throw new Error(`No se puede resolver ${label}: nombre duplicado "${item.name}".`);
    }
    lookup.set(key, item);
  }

  return lookup;
}

function resolveByName<T extends { name: string }>(
  lookup: Map<string, T>,
  name: string,
  label: string,
  context: string,
): T {
  const item = lookup.get(canonicalize(name));
  if (!item) {
    throw new Error(`${label} no encontrado "${name}" en ${context}.`);
  }

  return item;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = new Map<string, string>();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg?.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      options.set(key, "true");
      continue;
    }

    options.set(key, next);
    index += 1;
  }

  if (options.has("help")) {
    printHelp();
    process.exit(0);
  }

  return {
    csvDir: options.get("csv-dir") ?? path.resolve(process.cwd(), "templates/importacion-catalogo"),
    file: options.get("file") ?? "18_producto_componentes_compound.csv",
    dryRun: options.has("dry-run"),
  };
}

function printHelp() {
  console.log(
    `
Uso:
  node --import tsx scripts/sync-product-compound-components.ts [opciones]

Opciones:
  --csv-dir <ruta>  Carpeta de CSV (default: templates/importacion-catalogo)
  --file <archivo>  CSV a procesar (default: 18_producto_componentes_compound.csv)
  --dry-run         Validar y mostrar resumen sin escribir en base de datos
  --help            Mostrar ayuda

Formato:
  nombre_producto_compound,slot,nombre_producto_hijo,cantidad,orden_slot,orden_opcion,etiqueta

Formato legacy soportado:
  nombre_producto_compound,nombre_producto_hijo,cantidad,orden,etiqueta

Notas:
  - La sincronización es autoritativa por producto compound capturado en el CSV.
  - Cada producto compound debe tener al menos 2 secciones/slots.
  - Un slot con una sola opción se configura directamente; un slot con varias opciones se elige primero.
  - V1 no permite usar productos compound como hijos.
`.trim(),
  );
}

async function buildSyncRows(table: CsvTable): Promise<SyncRow[]> {
  const products = await db.query.productsDB.findMany({
    where(tableRef, { isNull }) {
      return isNull(tableRef.deletedAt);
    },
    columns: {
      id: true,
      name: true,
      productType: true,
    },
  });

  const productLookup = buildLookup(products, "producto");
  const rows: SyncRow[] = [];

  for (const row of table.rows) {
    const context = `${table.fileName}:${row.__line}`;
    const compoundProductName = getCell(table, row, "nombre_producto_compound", true);
    const componentProductName = getCell(table, row, "nombre_producto_hijo", true);
    const quantity = parsePositiveInteger(getCell(table, row, "cantidad", true), context);
    const isSlotFormat = hasColumn(table, "slot");
    const label = getCell(table, row, "etiqueta", false) || null;
    const slotName = isSlotFormat
      ? getCell(table, row, "slot", true)
      : (label ?? componentProductName);
    const slotSortOrder = parseNonNegativeInteger(
      getCell(table, row, isSlotFormat ? "orden_slot" : "orden", true),
      context,
    );
    const optionSortOrder = isSlotFormat
      ? parseNonNegativeInteger(getCell(table, row, "orden_opcion", true), context)
      : 0;

    const compoundProduct = resolveByName(
      productLookup,
      compoundProductName,
      "Producto compound",
      context,
    );
    const componentProduct = resolveByName(
      productLookup,
      componentProductName,
      "Producto hijo",
      context,
    );

    if (compoundProduct.productType !== "compound") {
      throw new Error(
        `${context}: "${compoundProductName}" debe tener productType compound en 02_productos.csv.`,
      );
    }

    if (componentProduct.productType === "compound") {
      throw new Error(`${context}: V1 no permite usar un producto compound como hijo.`);
    }

    if (compoundProduct.id === componentProduct.id) {
      throw new Error(`${context}: un producto compound no puede incluirse a sí mismo.`);
    }

    rows.push({
      line: row.__line,
      compoundProductId: compoundProduct.id,
      compoundProductName: compoundProduct.name,
      componentProductId: componentProduct.id,
      componentProductName: componentProduct.name,
      quantity,
      slotName,
      slotSortOrder,
      optionSortOrder,
      label,
    });
  }

  return rows;
}

function validateSyncRows(rows: SyncRow[]) {
  const rowsByCompound = new Map<string, SyncRow[]>();

  for (const row of rows) {
    const currentRows = rowsByCompound.get(row.compoundProductId) ?? [];
    currentRows.push(row);
    rowsByCompound.set(row.compoundProductId, currentRows);
  }

  for (const [compoundProductId, compoundRows] of rowsByCompound) {
    const firstRow = compoundRows[0];
    const slotKeys = new Set(compoundRows.map((row) => canonicalize(row.slotName)));
    if (slotKeys.size < 2) {
      throw new Error(
        `El producto compound "${firstRow?.compoundProductName ?? compoundProductId}" debe tener al menos 2 slots.`,
      );
    }

    const slotSortOrders = new Set<number>();
    const slotQuantityByKey = new Map<string, number>();
    const slotOrderByKey = new Map<string, number>();
    const optionOrdersBySlotKey = new Map<string, Set<number>>();
    const optionProductsBySlotKey = new Map<string, Set<string>>();
    for (const row of compoundRows) {
      const slotKey = canonicalize(row.slotName);
      const previousQuantity = slotQuantityByKey.get(slotKey);
      if (previousQuantity !== undefined && previousQuantity !== row.quantity) {
        throw new Error(
          `Cantidad distinta para el slot "${row.slotName}" en "${row.compoundProductName}" (${row.line}).`,
        );
      }
      slotQuantityByKey.set(slotKey, row.quantity);

      const previousSlotOrder = slotOrderByKey.get(slotKey);
      if (previousSlotOrder !== undefined && previousSlotOrder !== row.slotSortOrder) {
        throw new Error(
          `Orden de slot distinto para "${row.slotName}" en "${row.compoundProductName}" (${row.line}).`,
        );
      }
      slotOrderByKey.set(slotKey, row.slotSortOrder);

      if (!slotSortOrders.has(row.slotSortOrder)) {
        slotSortOrders.add(row.slotSortOrder);
      } else if (
        [...slotOrderByKey.entries()].filter(([, sortOrder]) => sortOrder === row.slotSortOrder)
          .length > 1
      ) {
        throw new Error(
          `Orden de slot duplicado ${row.slotSortOrder} en "${row.compoundProductName}" (${row.line}).`,
        );
      }

      const optionOrders = optionOrdersBySlotKey.get(slotKey) ?? new Set<number>();
      if (optionOrders.has(row.optionSortOrder)) {
        throw new Error(
          `Orden de opción duplicado ${row.optionSortOrder} para el slot "${row.slotName}" (${row.line}).`,
        );
      }
      optionOrders.add(row.optionSortOrder);
      optionOrdersBySlotKey.set(slotKey, optionOrders);

      const optionProducts = optionProductsBySlotKey.get(slotKey) ?? new Set<string>();
      if (optionProducts.has(row.componentProductId)) {
        throw new Error(
          `Producto hijo duplicado "${row.componentProductName}" para el slot "${row.slotName}" (${row.line}).`,
        );
      }
      optionProducts.add(row.componentProductId);
      optionProductsBySlotKey.set(slotKey, optionProducts);
    }
  }
}

async function main() {
  const options = parseArgs();
  const table = await loadCsvTable(options.csvDir, options.file);
  const rows = await buildSyncRows(table);
  validateSyncRows(rows);

  const compoundProductIds = [...new Set(rows.map((row) => row.compoundProductId))];

  console.log(`Archivo: ${table.filePath}`);
  console.log(`Componentes capturados: ${rows.length}`);
  console.log(`Productos compound a sincronizar: ${compoundProductIds.length}`);

  if (options.dryRun) {
    console.log("Dry run: no se escribieron cambios.");
    return;
  }

  if (compoundProductIds.length === 0) {
    console.log("No hay productos compound para sincronizar.");
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(productCompoundComponentsDB)
      .where(inArray(productCompoundComponentsDB.compoundProductId, compoundProductIds));
    await tx
      .delete(productCompoundSlotsDB)
      .where(inArray(productCompoundSlotsDB.compoundProductId, compoundProductIds));

    if (rows.length > 0) {
      const slotsByKey = new Map<
        string,
        {
          id: string;
          compoundProductId: string;
          label: string;
          quantity: number;
          sortOrder: number;
          rows: SyncRow[];
        }
      >();

      for (const row of rows) {
        const key = `${row.compoundProductId}:${canonicalize(row.slotName)}`;
        const slot = slotsByKey.get(key) ?? {
          id: generateNanoId(),
          compoundProductId: row.compoundProductId,
          label: row.slotName,
          quantity: row.quantity,
          sortOrder: row.slotSortOrder,
          rows: [],
        };
        slot.rows.push(row);
        slotsByKey.set(key, slot);
      }

      const slots = [...slotsByKey.values()].sort((left, right) => {
        if (left.compoundProductId !== right.compoundProductId) {
          return left.compoundProductId.localeCompare(right.compoundProductId);
        }
        return left.sortOrder - right.sortOrder;
      });

      await tx.insert(productCompoundSlotsDB).values(
        slots.map((slot) => ({
          id: slot.id,
          compoundProductId: slot.compoundProductId,
          label: slot.label,
          quantity: slot.quantity,
          sortOrder: slot.sortOrder,
        })),
      );

      await tx.insert(productCompoundSlotOptionsDB).values(
        slots.flatMap((slot) =>
          slot.rows.map((row) => ({
            id: generateNanoId(),
            slotId: slot.id,
            componentProductId: row.componentProductId,
            label: row.label,
            sortOrder: row.optionSortOrder,
          })),
        ),
      );
    }
  });

  const summary = await db
    .select({
      compoundProductId: productCompoundSlotsDB.compoundProductId,
    })
    .from(productCompoundSlotsDB)
    .where(inArray(productCompoundSlotsDB.compoundProductId, compoundProductIds));

  console.log(`Slots sincronizados: ${summary.length}`);
}

try {
  await main();
} finally {
  await pool.end();
}
