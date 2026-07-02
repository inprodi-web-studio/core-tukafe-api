import fs from "node:fs/promises";
import path from "node:path";

import { db, pool } from "@core/db";
import { productModifierVisibilityRulesDB } from "@core/db/schemas";
import { sql } from "drizzle-orm";

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
  variationGroupId: string;
  variationGroupName: string;
  variationOptionId: string;
  variationOptionName: string;
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
    file: options.get("file") ?? "17_producto_modificador_visibilidad.csv",
    dryRun: options.has("dry-run"),
  };
}

function printHelp() {
  console.log(
    `
Uso:
  node --import tsx scripts/sync-product-modifier-visibility.ts [opciones]

Opciones:
  --csv-dir <ruta>  Carpeta de CSV (default: templates/importacion-catalogo)
  --file <archivo>  CSV a procesar (default: 17_producto_modificador_visibilidad.csv)
  --dry-run         Validar y mostrar resumen sin escribir en base de datos
  --help            Mostrar ayuda

Formato:
  nombre_producto,nombre_modificador,nombre_grupo_variacion,nombre_opcion_variacion

Notas:
  - Varias filas para el mismo producto/modificador funcionan como OR.
  - Los modificadores sin filas quedan siempre visibles.
`.trim(),
  );
}

async function assertProductModifierVisibilityRulesTableExists() {
  const result = await db.execute<{ exists: boolean }>(sql`
    select to_regclass('public.product_modifier_visibility_rule') is not null as "exists"
  `);

  if (!result.rows[0]?.exists) {
    throw new Error(
      'La tabla "product_modifier_visibility_rule" no existe. Ejecuta las migraciones antes de sincronizar visibilidad.',
    );
  }
}

async function buildSyncRows(table: CsvTable): Promise<SyncRow[]> {
  const [products, modifiers, variationGroups, productModifiers, productVariationGroups] =
    await Promise.all([
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
        },
      }),
      db.query.variationGroupsDB.findMany({
        columns: {
          id: true,
          name: true,
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
      db.query.productModifiersDB.findMany({
        columns: {
          productId: true,
          modifierId: true,
        },
      }),
      db.query.productVariationGroupsDB.findMany({
        columns: {
          productId: true,
          variationGroupId: true,
        },
      }),
    ]);

  const productsByName = buildLookup(products, "producto");
  const modifiersByName = buildLookup(modifiers, "modificador");
  const variationGroupsByName = buildLookup(variationGroups, "grupo de variación");
  const productModifierKeys = new Set(
    productModifiers.map((row) => `${row.productId}:${row.modifierId}`),
  );
  const productVariationGroupKeys = new Set(
    productVariationGroups.map((row) => `${row.productId}:${row.variationGroupId}`),
  );
  const seenRules = new Set<string>();

  return table.rows.map((row) => {
    const context = `${table.fileName}:${row.__line}`;
    const productName = getCell(table, row, "nombre_producto", true);
    const modifierName = getCell(table, row, "nombre_modificador", true);
    const variationGroupName = getCell(table, row, "nombre_grupo_variacion", true);
    const variationOptionName = getCell(table, row, "nombre_opcion_variacion", true);
    const product = resolveByName(productsByName, productName, "Producto", context);
    const modifier = resolveByName(modifiersByName, modifierName, "Modificador", context);
    const variationGroup = resolveByName(
      variationGroupsByName,
      variationGroupName,
      "Grupo de variación",
      context,
    );
    const optionsByName = buildLookup(
      variationGroup.options,
      `opción del grupo de variación ${variationGroup.name}`,
    );
    const variationOption = resolveByName(
      optionsByName,
      variationOptionName,
      "Opción de variación",
      context,
    );

    if (!productModifierKeys.has(`${product.id}:${modifier.id}`)) {
      throw new Error(
        `El producto "${product.name}" no tiene asignado el modificador "${modifier.name}" en ${context}.`,
      );
    }

    if (!productVariationGroupKeys.has(`${product.id}:${variationGroup.id}`)) {
      throw new Error(
        `El producto "${product.name}" no tiene asignado el grupo de variación "${variationGroup.name}" en ${context}.`,
      );
    }

    const ruleKey = `${product.id}:${modifier.id}:${variationGroup.id}:${variationOption.id}`;
    if (seenRules.has(ruleKey)) {
      throw new Error(
        `Regla duplicada para producto "${product.name}" y modificador "${modifier.name}" en ${context}.`,
      );
    }
    seenRules.add(ruleKey);

    return {
      line: row.__line,
      productId: product.id,
      productName: product.name,
      modifierId: modifier.id,
      modifierName: modifier.name,
      variationGroupId: variationGroup.id,
      variationGroupName: variationGroup.name,
      variationOptionId: variationOption.id,
      variationOptionName: variationOption.name,
    };
  });
}

async function syncProductModifierVisibility(rows: SyncRow[], dryRun: boolean) {
  const rowsByProductModifier = new Map<string, SyncRow[]>();

  for (const row of rows) {
    const key = `${row.productId}:${row.modifierId}`;
    const currentRows = rowsByProductModifier.get(key) ?? [];
    currentRows.push(row);
    rowsByProductModifier.set(key, currentRows);
  }

  console.log(`Reglas de visibilidad procesadas: ${rows.length}`);
  console.log(`Producto/modificador con reglas: ${rowsByProductModifier.size}`);

  if (dryRun) {
    console.log("Dry run activo: no se escribió en base de datos.");
    return;
  }

  await db.transaction(async (tx) => {
    await tx.delete(productModifierVisibilityRulesDB);

    for (const productRows of rowsByProductModifier.values()) {
      if (productRows.length === 0) {
        continue;
      }

      await tx.insert(productModifierVisibilityRulesDB).values(
        productRows.map((row) => ({
          productId: row.productId,
          modifierId: row.modifierId,
          variationGroupId: row.variationGroupId,
          variationOptionId: row.variationOptionId,
        })),
      );
    }
  });

  console.log("Sincronización de visibilidad completada.");
}

async function main() {
  const config = parseArgs();
  const table = await loadCsvTable(config.csvDir, config.file);

  await assertProductModifierVisibilityRulesTableExists();
  const rows = await buildSyncRows(table);
  await syncProductModifierVisibility(rows, config.dryRun);
}

try {
  await main();
} finally {
  await pool.end();
}
