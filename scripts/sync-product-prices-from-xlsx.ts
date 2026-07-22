import fs from "node:fs/promises";
import path from "node:path";

import { pool } from "@core/db";
import type { PoolClient } from "pg";
import XLSX from "xlsx";

import {
  buildVariationSelectionKey,
  calculateVariationPrices,
  canonicalizePriceName,
  type VariationSelection,
} from "./product-price-sync.helpers";

const PRICE_SYNC_LOCK_KEY = 720250030;
const PRODUCT_FILE = "02_productos.csv";
const VARIATION_FILE = "10_variaciones_producto.csv";
const SELECTION_FILE = "11_selecciones_variacion_producto.csv";

interface Config {
  pricesFile: string;
  csvDir: string;
  apply: boolean;
  writeCatalogCsv: boolean;
  reportDir: string;
}

interface CsvTable {
  fileName: string;
  filePath: string;
  headers: string[];
  rows: string[][];
  newline: "\n" | "\r\n";
}

interface ExcelPrice {
  name: string;
  priceCents: number;
}

interface SourceVariation {
  productName: string;
  alias: string;
  line: number;
  rowIndex: number;
  priceColumnIndex: number;
  selections: VariationSelection[];
}

interface SourceProduct {
  name: string;
  rowIndex: number;
  priceColumnIndex: number;
}

interface DatabaseVariation {
  id: string;
  priceCents: number;
  selections: VariationSelection[];
}

interface DatabaseProduct {
  id: string;
  name: string;
  priceCents: number | null;
  variations: Map<string, DatabaseVariation>;
}

interface PricePlanRow {
  entityType: "product" | "variation";
  productId: string;
  productName: string;
  variationId: string | null;
  variationAlias: string | null;
  selectionKey: string | null;
  currentPriceCents: number;
  nextPriceCents: number;
  rule: string;
}

function cleanText(value: unknown) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim();
}

function repairMojibake(value: string) {
  if (!/[ÃÂ]/.test(value)) {
    return value;
  }

  try {
    return Buffer.from(value, "latin1").toString("utf8");
  } catch {
    return value;
  }
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
        if (text[index + 1] === '"') {
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
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (inQuotes) {
    throw new Error("CSV inválido: hay una celda con comillas sin cerrar.");
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows;
}

function escapeCsvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function serializeCsv(table: CsvTable) {
  return `${table.rows.map((row) => row.map(escapeCsvCell).join(",")).join(table.newline)}${table.newline}`;
}

async function loadCsvTable(csvDir: string, fileName: string): Promise<CsvTable> {
  const filePath = path.join(csvDir, fileName);
  const content = await fs.readFile(filePath, "utf8");
  const rows = parseCsv(content);
  const headers = (rows[0] ?? []).map(cleanText);

  if (headers.length === 0) {
    throw new Error(`${fileName} no contiene encabezados.`);
  }

  return {
    fileName,
    filePath,
    headers,
    rows,
    newline: content.includes("\r\n") ? "\r\n" : "\n",
  };
}

function getColumnIndex(table: CsvTable, header: string) {
  const index = table.headers.indexOf(header);
  if (index === -1) {
    throw new Error(`Falta la columna "${header}" en ${table.fileName}.`);
  }
  return index;
}

function getRowCell(table: CsvTable, row: string[], index: number, required = false) {
  const value = cleanText(row[index]);
  if (required && value.length === 0) {
    throw new Error(
      `Campo requerido vacío en ${table.fileName}:${table.rows.indexOf(row) + 1}, columna "${table.headers[index]}".`,
    );
  }
  return value;
}

function parseMoneyToCents(value: unknown, context: string) {
  const normalized =
    typeof value === "number"
      ? value
      : Number(
          String(value)
            .replace(/[$,\s]/g, "")
            .trim(),
        );

  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`Precio inválido en ${context}: "${value}".`);
  }

  const cents = Math.round(normalized * 100);
  if (Math.abs(normalized * 100 - cents) > 0.000_001) {
    throw new Error(`El precio en ${context} tiene más de dos decimales.`);
  }

  return cents;
}

function formatMoney(cents: number) {
  return (cents / 100).toFixed(2);
}

function buildUniqueLookup<T extends { name: string }>(items: T[], label: string) {
  const lookup = new Map<string, T>();

  for (const item of items) {
    const key = canonicalizePriceName(item.name);
    if (lookup.has(key)) {
      throw new Error(`${label} duplicado al normalizar el nombre: "${item.name}".`);
    }
    lookup.set(key, item);
  }

  return lookup;
}

function parseArgs(): Config {
  const args = process.argv.slice(2);
  const options = new Map<string, string>();
  const flags = new Set<string>();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg || arg === "--") {
      continue;
    }
    if (!arg.startsWith("--")) {
      throw new Error(`Argumento no reconocido: ${arg}`);
    }

    const key = arg.slice(2);
    if (["apply", "write-catalog-csv", "help"].includes(key)) {
      flags.add(key);
      continue;
    }

    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Falta valor para --${key}.`);
    }
    options.set(key, value);
    index += 1;
  }

  if (flags.has("help")) {
    console.log(
      `
Uso:
  yarn catalog:sync-prices -- --prices-file <archivo.xlsx> [opciones]

Opciones:
  --prices-file <ruta>      Excel con nombre_producto y precio_mxn (requerido)
  --csv-dir <ruta>          Catálogo fuente (default: templates/importacion-catalogo)
  --report-dir <ruta>       Directorio de reportes (default: reports/product-price-sync)
  --apply                   Escribir los precios en la base de datos
  --write-catalog-csv       Actualizar 10_variaciones_producto.csv con los precios calculados
  --help                    Mostrar ayuda

Sin --apply solo se valida y se genera el reporte; --write-catalog-csv es explícito porque modifica el CSV fuente.
`.trim(),
    );
    process.exit(0);
  }

  const pricesFile = options.get("prices-file");
  if (!pricesFile) {
    throw new Error("Debes indicar --prices-file <archivo.xlsx>.");
  }

  return {
    pricesFile: path.resolve(pricesFile),
    csvDir: path.resolve(options.get("csv-dir") ?? "templates/importacion-catalogo"),
    reportDir: path.resolve(options.get("report-dir") ?? "reports/product-price-sync"),
    apply: flags.has("apply"),
    writeCatalogCsv: flags.has("write-catalog-csv"),
  };
}

async function loadExcelPrices(filePath: string): Promise<ExcelPrice[]> {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`No se encontró el archivo de precios: ${filePath}`);
  }

  const workbook = XLSX.readFile(filePath, { raw: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("El Excel no contiene hojas.");
  }

  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) {
    throw new Error(`No se pudo leer la hoja ${firstSheetName}.`);
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: true,
  });
  const prices: ExcelPrice[] = [];

  for (const [index, row] of rows.entries()) {
    const name = repairMojibake(cleanText(row.nombre_producto));
    if (name.length === 0) {
      throw new Error(`Falta nombre_producto en ${path.basename(filePath)}:${index + 2}.`);
    }

    prices.push({
      name,
      priceCents: parseMoneyToCents(row.precio_mxn, `${path.basename(filePath)}:${index + 2}`),
    });
  }

  if (prices.length === 0) {
    throw new Error("El Excel no contiene precios.");
  }

  buildUniqueLookup(prices, "Producto del Excel");
  return prices;
}

function loadCatalogProducts(table: CsvTable) {
  const productColumn = getColumnIndex(table, "nombre_producto");
  const priceColumn = getColumnIndex(table, "precio_mxn");
  const products = table.rows.slice(1).flatMap((row, index) => {
    const name = getRowCell(table, row, productColumn);
    return name
      ? [
          {
            name,
            rowIndex: index + 1,
            priceColumnIndex: priceColumn,
          },
        ]
      : [];
  });

  buildUniqueLookup(products, "Producto del catálogo");
  return products;
}

function loadSourceVariations(variationsTable: CsvTable, selectionsTable: CsvTable) {
  const productColumn = getColumnIndex(variationsTable, "nombre_producto");
  const aliasColumn = getColumnIndex(variationsTable, "alias_variacion");
  const priceColumn = getColumnIndex(variationsTable, "precio_mxn");
  const selectionProductColumn = getColumnIndex(selectionsTable, "nombre_producto");
  const selectionAliasColumn = getColumnIndex(selectionsTable, "alias_variacion");
  const selectionsByAlias = new Map<string, VariationSelection[]>();

  for (let rowIndex = 1; rowIndex < selectionsTable.rows.length; rowIndex += 1) {
    const row = selectionsTable.rows[rowIndex]!;
    const productName = getRowCell(selectionsTable, row, selectionProductColumn, true);
    const alias = getRowCell(selectionsTable, row, selectionAliasColumn, true);
    const selections: VariationSelection[] = [];

    for (const position of [1, 2, 3]) {
      const groupColumn = getColumnIndex(selectionsTable, `nombre_grupo_variacion_${position}`);
      const optionColumn = getColumnIndex(selectionsTable, `nombre_opcion_${position}`);
      const groupName = getRowCell(selectionsTable, row, groupColumn);
      const optionName = getRowCell(selectionsTable, row, optionColumn);

      if (groupName.length === 0 && optionName.length === 0) {
        continue;
      }
      if (groupName.length === 0 || optionName.length === 0) {
        throw new Error(
          `Selección incompleta en ${selectionsTable.fileName}:${rowIndex + 1} para ${productName}/${alias}.`,
        );
      }
      selections.push({ groupName, optionName });
    }

    if (selections.length === 0) {
      throw new Error(
        `La variación ${productName}/${alias} no tiene selecciones en ${selectionsTable.fileName}:${rowIndex + 1}.`,
      );
    }

    const key = `${canonicalizePriceName(productName)}:${canonicalizePriceName(alias)}`;
    if (selectionsByAlias.has(key)) {
      throw new Error(
        `Alias de variación duplicado en ${selectionsTable.fileName}:${rowIndex + 1}.`,
      );
    }
    selectionsByAlias.set(key, selections);
  }

  const sourceVariations: SourceVariation[] = [];
  const aliases = new Set<string>();

  for (let rowIndex = 1; rowIndex < variationsTable.rows.length; rowIndex += 1) {
    const row = variationsTable.rows[rowIndex]!;
    const productName = getRowCell(variationsTable, row, productColumn, true);
    const alias = getRowCell(variationsTable, row, aliasColumn, true);
    parseMoneyToCents(
      getRowCell(variationsTable, row, priceColumn, true),
      `${variationsTable.fileName}:${rowIndex + 1}`,
    );

    const key = `${canonicalizePriceName(productName)}:${canonicalizePriceName(alias)}`;
    if (aliases.has(key)) {
      throw new Error(
        `Alias de variación duplicado en ${variationsTable.fileName}:${rowIndex + 1}.`,
      );
    }
    aliases.add(key);

    const selections = selectionsByAlias.get(key);
    if (!selections) {
      throw new Error(
        `No hay selección para ${productName}/${alias} en ${selectionsTable.fileName}.`,
      );
    }

    sourceVariations.push({
      productName,
      alias,
      line: rowIndex + 1,
      rowIndex,
      priceColumnIndex: priceColumn,
      selections,
    });
  }

  if (selectionsByAlias.size !== sourceVariations.length) {
    throw new Error(
      `${selectionsTable.fileName} contiene selecciones sin una variación correspondiente en ${variationsTable.fileName}.`,
    );
  }

  return sourceVariations;
}

async function loadDatabaseProducts(client: PoolClient): Promise<DatabaseProduct[]> {
  const result = await client.query<{
    product_id: string;
    product_name: string;
    product_price_cents: number | null;
    variation_id: string | null;
    variation_price_cents: number | null;
    group_name: string | null;
    option_name: string | null;
  }>(`
    select
      p.id as product_id,
      p.name as product_name,
      p.price_cents as product_price_cents,
      v.id as variation_id,
      v.price_cents as variation_price_cents,
      vg.name as group_name,
      vgo.name as option_name
    from "product" p
    left join "variation" v on v.product_id = p.id and v.deleted_at is null
    left join "variation_selection" vs on vs.variation_id = v.id
    left join "variation_group" vg on vg.id = vs.variation_group_id
    left join "variation_group_option" vgo on vgo.id = vs.variation_option_id
    where p.deleted_at is null
    order by p.id, v.id, vg.name, vgo.name;
  `);
  const productsById = new Map<string, DatabaseProduct>();

  for (const row of result.rows) {
    let product = productsById.get(row.product_id);
    if (!product) {
      product = {
        id: row.product_id,
        name: row.product_name,
        priceCents: row.product_price_cents,
        variations: new Map(),
      };
      productsById.set(product.id, product);
    }

    if (!row.variation_id || row.variation_price_cents === null) {
      continue;
    }

    let variation = product.variations.get(row.variation_id);
    if (!variation) {
      variation = {
        id: row.variation_id,
        priceCents: row.variation_price_cents,
        selections: [],
      };
      product.variations.set(variation.id, variation);
    }

    if (!row.group_name || !row.option_name) {
      throw new Error(
        `La variación ${variation.id} de ${product.name} no tiene selección completa.`,
      );
    }
    variation.selections.push({ groupName: row.group_name, optionName: row.option_name });
  }

  return [...productsById.values()];
}

function assertSameProductSet(excelPrices: ExcelPrice[], catalogProducts: SourceProduct[]) {
  const excelByName = buildUniqueLookup(excelPrices, "Producto del Excel");
  const catalogByName = buildUniqueLookup(catalogProducts, "Producto del catálogo");
  const onlyExcel = excelPrices.filter(
    (item) => !catalogByName.has(canonicalizePriceName(item.name)),
  );
  const onlyCatalog = catalogProducts.filter(
    (item) => !excelByName.has(canonicalizePriceName(item.name)),
  );

  if (onlyExcel.length > 0 || onlyCatalog.length > 0) {
    const details = [
      onlyExcel.length > 0 ? `Solo en Excel: ${onlyExcel.map((item) => item.name).join(", ")}` : "",
      onlyCatalog.length > 0
        ? `Solo en catálogo: ${onlyCatalog.map((item) => item.name).join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join(". ");
    throw new Error(`Los productos de Excel y catálogo no coinciden. ${details}`);
  }
}

function buildPricePlan(
  excelPrices: ExcelPrice[],
  sourceVariations: SourceVariation[],
  databaseProducts: DatabaseProduct[],
) {
  const pricesByProduct = buildUniqueLookup(excelPrices, "Producto del Excel");
  const databaseByProduct = buildUniqueLookup(databaseProducts, "Producto activo en DB");
  const sourceVariationsByProduct = new Map<string, SourceVariation[]>();
  const plan: PricePlanRow[] = [];

  for (const sourceVariation of sourceVariations) {
    const key = canonicalizePriceName(sourceVariation.productName);
    if (!pricesByProduct.has(key)) {
      throw new Error(
        `La variación ${sourceVariation.productName}/${sourceVariation.alias} no tiene producto en el Excel.`,
      );
    }
    const items = sourceVariationsByProduct.get(key) ?? [];
    items.push(sourceVariation);
    sourceVariationsByProduct.set(key, items);
  }

  for (const [productKey, excelPrice] of pricesByProduct.entries()) {
    const databaseProduct = databaseByProduct.get(productKey);
    if (!databaseProduct) {
      throw new Error(`El producto "${excelPrice.name}" no existe activo en la base de datos.`);
    }

    const sourceProductVariations = sourceVariationsByProduct.get(productKey) ?? [];
    if (sourceProductVariations.length === 0) {
      if (databaseProduct.variations.size > 0) {
        throw new Error(
          `El producto "${databaseProduct.name}" tiene variaciones en DB pero no en ${VARIATION_FILE}.`,
        );
      }
      if (databaseProduct.priceCents === null) {
        throw new Error(
          `El producto sin variaciones "${databaseProduct.name}" no tiene precio base en DB.`,
        );
      }

      plan.push({
        entityType: "product",
        productId: databaseProduct.id,
        productName: databaseProduct.name,
        variationId: null,
        variationAlias: null,
        selectionKey: null,
        currentPriceCents: databaseProduct.priceCents,
        nextPriceCents: excelPrice.priceCents,
        rule: "precio base del Excel",
      });
      continue;
    }

    if (databaseProduct.variations.size === 0) {
      throw new Error(
        `El producto "${databaseProduct.name}" tiene variaciones en ${VARIATION_FILE} pero no en DB.`,
      );
    }

    const sourceBySelection = new Map<string, SourceVariation>();
    for (const sourceVariation of sourceProductVariations) {
      const selectionKey = buildVariationSelectionKey(sourceVariation.selections);
      if (sourceBySelection.has(selectionKey)) {
        throw new Error(
          `Combinación de variación duplicada para "${databaseProduct.name}" en ${VARIATION_FILE}:${sourceVariation.line}.`,
        );
      }
      sourceBySelection.set(selectionKey, sourceVariation);
    }

    const databaseBySelection = new Map<string, DatabaseVariation>();
    for (const variation of databaseProduct.variations.values()) {
      const selectionKey = buildVariationSelectionKey(variation.selections);
      if (databaseBySelection.has(selectionKey)) {
        throw new Error(`Combinación de variación duplicada en DB para "${databaseProduct.name}".`);
      }
      databaseBySelection.set(selectionKey, variation);
    }

    const missingInDatabase = [...sourceBySelection.keys()].filter(
      (selectionKey) => !databaseBySelection.has(selectionKey),
    );
    const missingInCatalog = [...databaseBySelection.keys()].filter(
      (selectionKey) => !sourceBySelection.has(selectionKey),
    );
    if (missingInDatabase.length > 0 || missingInCatalog.length > 0) {
      throw new Error(
        `Las variaciones de "${databaseProduct.name}" no coinciden entre DB y CSV (faltan DB=${missingInDatabase.length}, CSV=${missingInCatalog.length}).`,
      );
    }

    const calculations = calculateVariationPrices(
      excelPrice.priceCents,
      [...databaseBySelection.entries()].map(([selectionKey, variation]) => ({
        key: selectionKey,
        currentPriceCents: variation.priceCents,
        selections: variation.selections,
      })),
    );

    for (const calculation of calculations) {
      const variation = databaseBySelection.get(calculation.key)!;
      const sourceVariation = sourceBySelection.get(calculation.key)!;
      plan.push({
        entityType: "variation",
        productId: databaseProduct.id,
        productName: databaseProduct.name,
        variationId: variation.id,
        variationAlias: sourceVariation.alias,
        selectionKey: calculation.key,
        currentPriceCents: calculation.currentPriceCents,
        nextPriceCents: calculation.nextPriceCents,
        rule: calculation.rule,
      });
    }
  }

  return plan;
}

async function writeReport(rows: PricePlanRow[], reportDir: string) {
  await fs.mkdir(reportDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const basePath = path.join(reportDir, `product-price-sync-${timestamp}`);
  const csvRows = [
    [
      "tipo",
      "producto",
      "alias_variacion",
      "selecciones",
      "precio_anterior_mxn",
      "precio_nuevo_mxn",
      "cambio",
      "regla",
    ],
    ...rows.map((row) => [
      row.entityType,
      row.productName,
      row.variationAlias ?? "",
      row.selectionKey ?? "",
      formatMoney(row.currentPriceCents),
      formatMoney(row.nextPriceCents),
      row.currentPriceCents === row.nextPriceCents ? "sin cambio" : "actualizar",
      row.rule,
    ]),
  ];
  const csv = `${csvRows.map((row) => row.map(escapeCsvCell).join(",")).join("\n")}\n`;

  await Promise.all([
    fs.writeFile(`${basePath}.csv`, csv, "utf8"),
    fs.writeFile(`${basePath}.json`, `${JSON.stringify(rows, null, 2)}\n`, "utf8"),
  ]);

  return basePath;
}

async function writeCatalogPrices(
  productsTable: CsvTable,
  sourceProducts: SourceProduct[],
  table: CsvTable,
  sourceVariations: SourceVariation[],
  plan: PricePlanRow[],
) {
  const pricesByAlias = new Map(
    plan
      .filter((row) => row.entityType === "variation" && row.variationAlias)
      .map((row) => [
        `${canonicalizePriceName(row.productName)}:${canonicalizePriceName(row.variationAlias!)}`,
        formatMoney(row.nextPriceCents),
      ]),
  );
  const productPlansByName = new Map(
    plan
      .filter((row) => row.entityType === "product")
      .map((row) => [canonicalizePriceName(row.productName), row]),
  );

  for (const sourceVariation of sourceVariations) {
    const nextPrice = pricesByAlias.get(
      `${canonicalizePriceName(sourceVariation.productName)}:${canonicalizePriceName(sourceVariation.alias)}`,
    );
    if (nextPrice === undefined) {
      throw new Error(
        `No se calculó precio para ${sourceVariation.productName}/${sourceVariation.alias}.`,
      );
    }
    const currentPrice = parseMoneyToCents(
      table.rows[sourceVariation.rowIndex]![sourceVariation.priceColumnIndex],
      `${table.fileName}:${sourceVariation.line}`,
    );
    if (currentPrice !== Number(nextPrice) * 100) {
      table.rows[sourceVariation.rowIndex]![sourceVariation.priceColumnIndex] = nextPrice;
    }
  }

  for (const sourceProduct of sourceProducts) {
    const productPlan = productPlansByName.get(canonicalizePriceName(sourceProduct.name));
    if (productPlan) {
      const currentPrice = parseMoneyToCents(
        productsTable.rows[sourceProduct.rowIndex]![sourceProduct.priceColumnIndex],
        `${productsTable.fileName}:${sourceProduct.rowIndex + 1}`,
      );
      if (currentPrice !== productPlan.nextPriceCents) {
        productsTable.rows[sourceProduct.rowIndex]![sourceProduct.priceColumnIndex] = formatMoney(
          productPlan.nextPriceCents,
        );
      }
    }
  }

  await Promise.all([
    fs.writeFile(productsTable.filePath, serializeCsv(productsTable), "utf8"),
    fs.writeFile(table.filePath, serializeCsv(table), "utf8"),
  ]);
}

async function applyDatabasePricePlan(client: PoolClient, rows: PricePlanRow[]) {
  const changedRows = rows.filter((row) => row.currentPriceCents !== row.nextPriceCents);
  if (changedRows.length === 0) {
    return 0;
  }

  await client.query("begin;");
  try {
    for (const row of changedRows) {
      if (row.entityType === "product") {
        await client.query(
          `update "product"
           set price_cents = $1, updated_at = now()
           where id = $2 and deleted_at is null;`,
          [row.nextPriceCents, row.productId],
        );
      } else {
        await client.query(
          `update "variation"
           set price_cents = $1, updated_at = now()
           where id = $2 and deleted_at is null;`,
          [row.nextPriceCents, row.variationId],
        );
      }
    }
    await client.query("commit;");
  } catch (error) {
    await client.query("rollback;");
    throw error;
  }

  return changedRows.length;
}

async function main() {
  const config = parseArgs();
  const [excelPrices, productsTable, variationsTable, selectionsTable] = await Promise.all([
    loadExcelPrices(config.pricesFile),
    loadCsvTable(config.csvDir, PRODUCT_FILE),
    loadCsvTable(config.csvDir, VARIATION_FILE),
    loadCsvTable(config.csvDir, SELECTION_FILE),
  ]);
  const catalogProducts = loadCatalogProducts(productsTable);
  const sourceVariations = loadSourceVariations(variationsTable, selectionsTable);
  assertSameProductSet(excelPrices, catalogProducts);

  const client = await pool.connect();
  let lockHeld = false;

  try {
    await client.query("select pg_advisory_lock($1);", [PRICE_SYNC_LOCK_KEY]);
    lockHeld = true;

    const databaseProducts = await loadDatabaseProducts(client);
    const plan = buildPricePlan(excelPrices, sourceVariations, databaseProducts);
    const changedRows = plan.filter((row) => row.currentPriceCents !== row.nextPriceCents);
    const variationRows = plan.filter((row) => row.entityType === "variation");
    const productRows = plan.filter((row) => row.entityType === "product");
    const reportBasePath = await writeReport(plan, config.reportDir);

    console.log(`Productos del Excel: ${excelPrices.length}`);
    console.log(`Variaciones validadas: ${variationRows.length}`);
    console.log(`Productos sin variaciones validados: ${productRows.length}`);
    console.log(`Registros con cambio de precio: ${changedRows.length}`);
    console.log(`Reporte: ${reportBasePath}.{csv,json}`);

    if (config.apply) {
      const applied = await applyDatabasePricePlan(client, plan);
      console.log(`Base de datos actualizada: ${applied} registro(s).`);
    } else {
      console.log(
        "Dry run de base de datos: no se escribieron precios. Usa --apply para confirmar.",
      );
    }

    if (config.writeCatalogCsv) {
      await writeCatalogPrices(
        productsTable,
        catalogProducts,
        variationsTable,
        sourceVariations,
        plan,
      );
      console.log(`${PRODUCT_FILE} y ${VARIATION_FILE} sincronizados.`);
    }
  } finally {
    if (lockHeld) {
      await client.query("select pg_advisory_unlock($1);", [PRICE_SYNC_LOCK_KEY]);
    }
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[catalog:sync-prices] Error:", error);
  process.exit(1);
});
