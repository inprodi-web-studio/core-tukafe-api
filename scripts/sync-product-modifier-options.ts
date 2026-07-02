import fs from "node:fs/promises";
import path from "node:path";

import { db, pool } from "@core/db";
import { productModifierOptionsDB, productModifiersDB } from "@core/db/schemas";
import { and, asc, eq, sql } from "drizzle-orm";

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
  productId: string;
  productName: string;
  modifierId: string;
  modifierName: string;
  sortOrder: number;
  optionIds: string[] | null;
  optionNames: string[];
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

function parseNumber(table: CsvTable, row: CsvRow, key: string, required = false): number | null {
  const raw = getCell(table, row, key, required);

  if (raw.length === 0) {
    return null;
  }

  const value = Number(raw.replace(/\$/g, ""));
  if (!Number.isFinite(value)) {
    throw new Error(
      `Número inválido en ${table.fileName}:${row.__line} columna "${key}" => "${raw}".`,
    );
  }

  return value;
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

function parseAllowedOptionNames(table: CsvTable, row: CsvRow): string[] | null {
  const rawAllowedOptions = getCell(table, row, "opciones_permitidas");

  if (rawAllowedOptions.length === 0) {
    return null;
  }

  const optionNames = rawAllowedOptions
    .split("|")
    .map((value) => cleanText(value))
    .filter(Boolean);

  if (optionNames.length === 0) {
    throw new Error(
      `opciones_permitidas no contiene opciones válidas en ${table.fileName}:${row.__line}.`,
    );
  }

  const uniqueNames = new Set(optionNames.map(canonicalize));
  if (uniqueNames.size !== optionNames.length) {
    throw new Error(
      `opciones_permitidas contiene opciones duplicadas en ${table.fileName}:${row.__line}.`,
    );
  }

  return optionNames;
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
    file: options.get("file") ?? "16_producto_modificadores.csv",
    dryRun: options.has("dry-run"),
  };
}

function printHelp() {
  console.log(
    `
Uso:
  node --import tsx scripts/sync-product-modifier-options.ts [opciones]

Opciones:
  --csv-dir <ruta>  Carpeta de CSV (default: templates/importacion-catalogo)
  --file <archivo>  CSV a procesar (default: 16_producto_modificadores.csv)
  --dry-run         Validar y mostrar resumen sin escribir en base de datos
  --help            Mostrar ayuda

Formato:
  nombre_producto,nombre_modificador,orden_en_producto,opciones_permitidas

Notas:
  - opciones_permitidas usa nombres separados por "|".
  - opciones_permitidas vacío significa permitir todas las opciones del modificador.
`.trim(),
  );
}

async function assertProductModifierOptionsTableExists() {
  const result = await db.execute<{ exists: boolean }>(sql`
    select to_regclass('public.product_modifier_option') is not null as "exists"
  `);

  if (!result.rows[0]?.exists) {
    throw new Error(
      'La tabla "product_modifier_option" no existe. Ejecuta las migraciones antes de sincronizar opciones.',
    );
  }
}

async function buildSyncRows(table: CsvTable): Promise<SyncRow[]> {
  const [products, modifiers] = await Promise.all([
    db.query.productsDB.findMany({
      where(tableRef, { isNull }) {
        return isNull(tableRef.deletedAt);
      },
      columns: {
        id: true,
        name: true,
      },
    }),
    db.query.modifiersDB.findMany({
      columns: {
        id: true,
        name: true,
        minSelect: true,
      },
      with: {
        options: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
    }),
  ]);

  const productsByName = buildLookup(products, "producto");
  const modifiersByName = buildLookup(modifiers, "modificador");
  const seenRows = new Set<string>();
  const seenSortOrders = new Set<string>();

  return table.rows.map((row) => {
    const context = `${table.fileName}:${row.__line}`;
    const productName = getCell(table, row, "nombre_producto", true);
    const modifierName = getCell(table, row, "nombre_modificador", true);
    const product = resolveByName(productsByName, productName, "Producto", context);
    const modifier = resolveByName(modifiersByName, modifierName, "Modificador", context);
    const sortOrder = parseNumber(table, row, "orden_en_producto", true);
    const rowKey = `${product.id}:${modifier.id}`;

    if (seenRows.has(rowKey)) {
      throw new Error(
        `Fila duplicada para producto "${product.name}" y modificador "${modifier.name}" en ${context}.`,
      );
    }
    seenRows.add(rowKey);

    if (sortOrder === null || !Number.isInteger(sortOrder) || sortOrder < 0) {
      throw new Error(
        `orden_en_producto inválido para producto "${product.name}" y modificador "${modifier.name}" en ${context}.`,
      );
    }

    const sortOrderKey = `${product.id}:${sortOrder}`;
    if (seenSortOrders.has(sortOrderKey)) {
      throw new Error(
        `orden_en_producto duplicado (${sortOrder}) para producto "${product.name}" en ${context}.`,
      );
    }
    seenSortOrders.add(sortOrderKey);

    const optionNames = parseAllowedOptionNames(table, row);
    const optionsByName = buildLookup(modifier.options, `opción del modificador ${modifier.name}`);
    const optionIds = optionNames?.map((optionName) => {
      return resolveByName(optionsByName, optionName, "Opción de modificador", context).id;
    }) ?? null;

    if (optionIds && modifier.minSelect > optionIds.length) {
      throw new Error(
        `El modificador "${modifier.name}" requiere mínimo ${modifier.minSelect} selección(es), pero ${context} solo permite ${optionIds.length} opción(es).`,
      );
    }

    return {
      line: row.__line,
      productId: product.id,
      productName: product.name,
      modifierId: modifier.id,
      modifierName: modifier.name,
      sortOrder,
      optionIds,
      optionNames: optionNames ?? [],
    };
  });
}

async function syncProductModifierOptions(rows: SyncRow[], dryRun: boolean) {
  const rowsByProduct = new Map<string, SyncRow[]>();
  const scopedRows = rows.filter((row) => row.optionIds !== null);
  const unrestrictedRows = rows.filter((row) => row.optionIds === null);
  const optionInsertRows = scopedRows.flatMap((row) => {
    return row.optionIds!.map((modifierOptionId) => ({
      productId: row.productId,
      modifierId: row.modifierId,
      modifierOptionId,
    }));
  });

  for (const row of rows) {
    const productRows = rowsByProduct.get(row.productId) ?? [];
    productRows.push(row);
    rowsByProduct.set(row.productId, productRows);
  }

  console.log(`Productos/modificadores procesados: ${rows.length}`);
  console.log(`  - Vínculos product_modifier a crear/actualizar: ${rows.length}`);
  console.log(`  - Productos con modificadores autoritativos: ${rowsByProduct.size}`);
  console.log(`  - Con opciones específicas: ${scopedRows.length}`);
  console.log(`  - Permitir todas las opciones: ${unrestrictedRows.length}`);
  console.log(`  - Registros product_modifier_option a insertar: ${optionInsertRows.length}`);

  if (dryRun) {
    console.log("Dry run activo: no se escribió en base de datos.");
    return;
  }

  await db.transaction(async (tx) => {
    const temporarySortOrderOffset = 100_000;

    for (const [productId, productRows] of rowsByProduct.entries()) {
      const sortedRows = [...productRows].sort((left, right) => left.sortOrder - right.sortOrder);
      const desiredModifierIds = new Set(sortedRows.map((row) => row.modifierId));
      const existingRows = await tx
        .select({
          productId: productModifiersDB.productId,
          modifierId: productModifiersDB.modifierId,
          sortOrder: productModifiersDB.sortOrder,
        })
        .from(productModifiersDB)
        .where(eq(productModifiersDB.productId, productId))
        .orderBy(asc(productModifiersDB.sortOrder));

      if (existingRows.length > 0) {
        await tx
          .update(productModifiersDB)
          .set({
            sortOrder: sql`${productModifiersDB.sortOrder} + ${temporarySortOrderOffset}`,
            updatedAt: sql`now()`,
          })
          .where(eq(productModifiersDB.productId, productId));
      }

      for (const row of sortedRows) {
        await tx
          .insert(productModifiersDB)
          .values({
            productId: row.productId,
            modifierId: row.modifierId,
            sortOrder: row.sortOrder,
          })
          .onConflictDoUpdate({
            target: [productModifiersDB.productId, productModifiersDB.modifierId],
            set: {
              sortOrder: row.sortOrder,
              updatedAt: sql`now()`,
            },
          });
      }

      for (const existingRow of existingRows) {
        if (desiredModifierIds.has(existingRow.modifierId)) {
          continue;
        }

        await tx
          .delete(productModifiersDB)
          .where(
            and(
              eq(productModifiersDB.productId, existingRow.productId),
              eq(productModifiersDB.modifierId, existingRow.modifierId),
            ),
          );
      }
    }

    for (const row of rows) {
      await tx
        .delete(productModifierOptionsDB)
        .where(
          and(
            eq(productModifierOptionsDB.productId, row.productId),
            eq(productModifierOptionsDB.modifierId, row.modifierId),
          ),
        );
    }

    if (optionInsertRows.length > 0) {
      await tx.insert(productModifierOptionsDB).values(optionInsertRows);
    }
  });

  console.log("Sincronización completada.");
}

async function main() {
  const config = parseArgs();
  const table = await loadCsvTable(config.csvDir, config.file);

  await assertProductModifierOptionsTableExists();
  const rows = await buildSyncRows(table);
  await syncProductModifierOptions(rows, config.dryRun);
}

try {
  await main();
} finally {
  await pool.end();
}
