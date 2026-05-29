import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

type CsvRow = Record<string, string>;

interface RollbackConfig {
  csvDir: string;
  execute: boolean;
  apiUrl?: string;
}

function canonicalize(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function tryRepairLatin1Mojibake(value: string) {
  if (!/[ÃÂ]/.test(value)) {
    return value;
  }

  try {
    const repaired = Buffer.from(value, "latin1").toString("utf8");

    if (repaired.includes("�") && !value.includes("�")) {
      return value;
    }

    return repaired;
  } catch {
    return value;
  }
}

function repairKnownArtifacts(value: string) {
  return value
    .replace(/Matche/gi, "Matcha")
    .replace(/Fr�o/gi, "Frío")
    .replace(/fr_o/gi, "frio")
    .replace(/Caf�/g, "Café")
    .replace(/caf�/g, "café")
    .replace(/Distinci�n/gi, "Distinción")
    .replace(/�Quieres/g, "¿Quieres")
    .replace(/alg�n/gi, "algún");
}

function cleanText(value: string | null | undefined) {
  const base = (value ?? "").trim().replace(/\s+/g, " ");
  return repairKnownArtifacts(tryRepairLatin1Mojibake(base));
}

function parseCsv(content: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const text = content.replace(/^\uFEFF/, "");

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === "\"") {
        const nextChar = text[i + 1];

        if (nextChar === "\"") {
          field += "\"";
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === "\"") {
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

    if (char === "\r") {
      continue;
    }

    field += char;
  }

  row.push(field);
  rows.push(row);

  if (rows.length === 0) {
    return { headers: [], records: [] as CsvRow[] };
  }

  const headers = (rows[0] ?? []).map((cell) => cleanText(cell));
  const records: CsvRow[] = [];

  for (let index = 1; index < rows.length; index += 1) {
    const raw = rows[index] ?? [];
    const isEmpty = raw.every((value) => cleanText(value).length === 0);
    if (isEmpty) {
      continue;
    }

    const record: CsvRow = {};
    for (let col = 0; col < headers.length; col += 1) {
      const header = headers[col] ?? `col_${col + 1}`;
      record[header] = cleanText(raw[col] ?? "");
    }
    records.push(record);
  }

  return { headers, records };
}

function decodeCsvBuffer(raw: Buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    try {
      // Many spreadsheet exports on macOS produce Macintosh-encoded CSV files.
      return new TextDecoder("macintosh").decode(raw);
    } catch {
      return raw.toString("utf8");
    }
  }
}

async function loadCsvRows(csvDir: string, fileName: string) {
  const filePath = path.join(csvDir, fileName);
  const raw = await fs.readFile(filePath);
  const content = decodeCsvBuffer(raw);
  const parsed = parseCsv(content);
  return parsed.records;
}

function getValues(rows: CsvRow[], key: string) {
  return [...new Set(rows.map((row) => cleanText(row[key])).filter(Boolean))];
}

function createDbClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("No se encontró DATABASE_URL en el entorno.");
  }

  const rejectUnauthorized = cleanText(
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED,
  ).toLowerCase();
  const sslRejectUnauthorized = rejectUnauthorized !== "false";
  const ca = cleanText(process.env.DATABASE_SSL_CA_CERT).replace(/\\n/g, "\n");

  return new pg.Client({
    connectionString: databaseUrl,
    ssl: ca
      ? {
          ca,
          rejectUnauthorized: sslRejectUnauthorized,
        }
      : sslRejectUnauthorized
        ? undefined
        : { rejectUnauthorized: false },
  });
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = new Map<string, string>();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
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
    console.log(`
Uso:
  node --env-file=.env --import tsx scripts/rollback-catalog-import.ts [opciones]

Opciones:
  --csv-dir <ruta>     Carpeta CSV (default: templates/importacion-catalogo)
  --execute            Ejecuta borrado real. Sin esta bandera es solo dry-run.
  --help               Muestra esta ayuda
`.trim());
    process.exit(0);
  }

  return {
    csvDir:
      options.get("csv-dir") ??
      path.resolve(process.cwd(), "templates/importacion-catalogo"),
    execute: options.has("execute"),
  } satisfies RollbackConfig;
}

async function main() {
  const config = parseArgs();
  const client = createDbClient();

  console.log("==========================================");
  console.log("Rollback catálogo TuKafe");
  console.log("==========================================");
  console.log(`CSV DIR: ${config.csvDir}`);
  console.log(`Modo: ${config.execute ? "EJECUCION REAL" : "DRY-RUN (no persiste cambios)"}`);
  console.log("------------------------------------------");

  const [
    productCategoriesRows,
    productsRows,
    ingredientCategoriesRows,
    ingredientsRows,
    supplyCategoriesRows,
    suppliesRows,
    variationGroupsRows,
    modifiersRows,
  ] = await Promise.all([
    loadCsvRows(config.csvDir, "01_categorias_producto.csv"),
    loadCsvRows(config.csvDir, "02_productos.csv"),
    loadCsvRows(config.csvDir, "03_categorias_ingrediente.csv"),
    loadCsvRows(config.csvDir, "04_ingredientes.csv"),
    loadCsvRows(config.csvDir, "05_categorias_insumo.csv"),
    loadCsvRows(config.csvDir, "06_insumos.csv"),
    loadCsvRows(config.csvDir, "07_grupos_variacion.csv"),
    loadCsvRows(config.csvDir, "13_modificadores.csv"),
  ]);

  const targetProductNames = getValues(productsRows, "nombre_producto");
  const targetIngredientNames = getValues(ingredientsRows, "nombre_ingrediente");
  const targetSupplyNames = getValues(suppliesRows, "nombre_insumo");
  const targetModifierNames = getValues(modifiersRows, "nombre_modificador");
  const targetVariationGroupNames = getValues(variationGroupsRows, "nombre_grupo_variacion");
  const targetProductCategoryNames = getValues(productCategoriesRows, "nombre_categoria");
  const targetIngredientCategoryNames = getValues(ingredientCategoriesRows, "nombre_categoria");
  const targetSupplyCategoryNames = getValues(supplyCategoriesRows, "nombre_categoria");

  const targetUnitRawValues = [
    ...getValues(productsRows, "unidad_venta"),
    ...getValues(ingredientsRows, "unidad_base"),
    ...getValues(suppliesRows, "unidad_base"),
  ];
  const targetUnitCanonical = new Set(targetUnitRawValues.map((value) => canonicalize(value)));

  await client.connect();
  await client.query("BEGIN;");

  try {
    const organizationsResult = await client.query<{
      id: string;
      name: string;
      slug: string;
      address: string;
      deleted_at: string | null;
    }>(
      `select id, name, slug, address, deleted_at
       from "organization"
       where deleted_at is null;`,
    );

    const popupOrganizations = organizationsResult.rows.filter((organization) => {
      const normalizedName = canonicalize(organization.name);
      const normalizedSlug = canonicalize(organization.slug);
      const normalizedAddress = canonicalize(organization.address);

      return (
        normalizedName === "popup" ||
        normalizedSlug.startsWith("popup") ||
        normalizedAddress === canonicalize("Sin direccion fisica (sucursal temporal).")
      );
    });

    const popupOrganizationIds = popupOrganizations.map((organization) => organization.id);
    console.log(`Organizaciones Pop Up detectadas: ${popupOrganizationIds.length}`);

    const productCandidatesResult = popupOrganizationIds.length
      ? await client.query<{ id: string; name: string }>(
          `select distinct p.id, p.name
           from "product" p
           join "organization_product" op on op.product_id = p.id
           where p.deleted_at is null
             and op.organization_id = any($1::text[]);`,
          [popupOrganizationIds],
        )
      : { rows: [] as Array<{ id: string; name: string }> };

    const targetProductNameSet = new Set(targetProductNames.map((value) => canonicalize(value)));
    const targetProducts = productCandidatesResult.rows.filter((product) =>
      targetProductNameSet.has(canonicalize(product.name)),
    );
    const targetProductIds = targetProducts.map((product) => product.id);

    const productOrderUsage = targetProductIds.length
      ? await client.query<{ product_id: string }>(
          `select distinct product_id from "order_item"
           where product_id = any($1::text[]);`,
          [targetProductIds],
        )
      : { rows: [] as Array<{ product_id: string }> };

    const inUseProductIds = new Set(productOrderUsage.rows.map((row) => row.product_id));
    const deletableProductIds = targetProductIds.filter((id) => !inUseProductIds.has(id));
    const protectedProductIds = targetProductIds.filter((id) => inUseProductIds.has(id));

    console.log(`Productos objetivo detectados: ${targetProductIds.length}`);
    if (protectedProductIds.length > 0) {
      console.log(`Productos NO eliminables por historial de orden: ${protectedProductIds.length}`);
    }

    if (config.execute && deletableProductIds.length > 0) {
      await client.query(`delete from "product" where id = any($1::text[]);`, [deletableProductIds]);
    }
    console.log(`Productos eliminables: ${deletableProductIds.length}`);

    const variationGroupsResult = await client.query<{ id: string; name: string }>(
      `select id, name from "variation_group";`,
    );
    const variationGroupNameSet = new Set(
      targetVariationGroupNames.map((value) => canonicalize(value)),
    );
    const targetVariationGroups = variationGroupsResult.rows.filter((group) =>
      variationGroupNameSet.has(canonicalize(group.name)),
    );
    const targetVariationGroupIds = targetVariationGroups.map((group) => group.id);

    const variationGroupsInUse = targetVariationGroupIds.length
      ? await client.query<{ id: string }>(
          `
          select distinct vg.id
          from "variation_group" vg
          left join "product_variation_group" pvg on pvg.variation_group_id = vg.id
          left join "variation_selection" vs on vs.variation_group_id = vg.id
          where vg.id = any($1::text[])
            and (pvg.variation_group_id is not null or vs.variation_group_id is not null);
          `,
          [targetVariationGroupIds],
        )
      : { rows: [] as Array<{ id: string }> };

    const variationGroupsInUseSet = new Set(variationGroupsInUse.rows.map((row) => row.id));
    const deletableVariationGroupIds = targetVariationGroupIds.filter(
      (id) => !variationGroupsInUseSet.has(id),
    );

    if (config.execute && deletableVariationGroupIds.length > 0) {
      await client.query(`delete from "variation_group" where id = any($1::text[]);`, [
        deletableVariationGroupIds,
      ]);
    }
    console.log(`Grupos de variación eliminables: ${deletableVariationGroupIds.length}`);

    const modifiersResult = await client.query<{ id: string; name: string }>(
      `select id, name from "modifier";`,
    );
    const modifierNameSet = new Set(targetModifierNames.map((value) => canonicalize(value)));
    const targetModifiers = modifiersResult.rows.filter((modifier) =>
      modifierNameSet.has(canonicalize(modifier.name)),
    );
    const targetModifierIds = targetModifiers.map((modifier) => modifier.id);

    const modifiersInUse = targetModifierIds.length
      ? await client.query<{ modifier_id: string }>(
          `
          select distinct m.id as modifier_id
          from "modifier" m
          left join "product_modifier" pm on pm.modifier_id = m.id
          left join "order_item_modifier" oim on oim.modifier_id = m.id
          where m.id = any($1::text[])
            and (pm.modifier_id is not null or oim.modifier_id is not null);
          `,
          [targetModifierIds],
        )
      : { rows: [] as Array<{ modifier_id: string }> };

    const modifiersInUseSet = new Set(modifiersInUse.rows.map((row) => row.modifier_id));
    const deletableModifierIds = targetModifierIds.filter((id) => !modifiersInUseSet.has(id));

    if (config.execute && deletableModifierIds.length > 0) {
      await client.query(`delete from "modifier" where id = any($1::text[]);`, [
        deletableModifierIds,
      ]);
    }
    console.log(`Modificadores eliminables: ${deletableModifierIds.length}`);

    const ingredientsResult = await client.query<{ id: string; name: string; deleted_at: string | null }>(
      `select id, name, deleted_at from "ingredient" where deleted_at is null;`,
    );
    const ingredientNameSet = new Set(targetIngredientNames.map((value) => canonicalize(value)));
    const targetIngredients = ingredientsResult.rows.filter((ingredient) =>
      ingredientNameSet.has(canonicalize(ingredient.name)),
    );
    const targetIngredientIds = targetIngredients.map((ingredient) => ingredient.id);

    const ingredientInUse = targetIngredientIds.length
      ? await client.query<{ ingredient_id: string }>(
          `
          select distinct x.ingredient_id
          from (
            select ingredient_id from "recipe_ingredient" where ingredient_id = any($1::text[])
            union
            select ingredient_id from "variation_recipe_ingredient" where ingredient_id = any($1::text[])
            union
            select ingredient_id from "modifier_option_ingredient" where ingredient_id = any($1::text[])
          ) x;
          `,
          [targetIngredientIds],
        )
      : { rows: [] as Array<{ ingredient_id: string }> };

    const ingredientInUseSet = new Set(ingredientInUse.rows.map((row) => row.ingredient_id));
    const deletableIngredientIds = targetIngredientIds.filter((id) => !ingredientInUseSet.has(id));

    if (config.execute && deletableIngredientIds.length > 0) {
      await client.query(`delete from "ingredient" where id = any($1::text[]);`, [
        deletableIngredientIds,
      ]);
    }
    console.log(`Ingredientes eliminables: ${deletableIngredientIds.length}`);

    const suppliesResult = await client.query<{ id: string; name: string; deleted_at: string | null }>(
      `select id, name, deleted_at from "supply" where deleted_at is null;`,
    );
    const supplyNameSet = new Set(targetSupplyNames.map((value) => canonicalize(value)));
    const targetSupplies = suppliesResult.rows.filter((supply) =>
      supplyNameSet.has(canonicalize(supply.name)),
    );
    const targetSupplyIds = targetSupplies.map((supply) => supply.id);

    const supplyInUse = targetSupplyIds.length
      ? await client.query<{ supply_id: string }>(
          `
          select distinct x.supply_id
          from (
            select supply_id from "recipe_supply" where supply_id = any($1::text[])
            union
            select supply_id from "variation_recipe_supply" where supply_id = any($1::text[])
            union
            select supply_id from "modifier_option_supply" where supply_id = any($1::text[])
          ) x;
          `,
          [targetSupplyIds],
        )
      : { rows: [] as Array<{ supply_id: string }> };

    const supplyInUseSet = new Set(supplyInUse.rows.map((row) => row.supply_id));
    const deletableSupplyIds = targetSupplyIds.filter((id) => !supplyInUseSet.has(id));

    if (config.execute && deletableSupplyIds.length > 0) {
      await client.query(`delete from "supply" where id = any($1::text[]);`, [deletableSupplyIds]);
    }
    console.log(`Insumos eliminables: ${deletableSupplyIds.length}`);

    const ingredientCategoriesResult = await client.query<{ id: string; name: string }>(
      `select id, name from "ingredient_category";`,
    );
    const ingredientCategoryNameSet = new Set(
      targetIngredientCategoryNames.map((value) => canonicalize(value)),
    );
    const targetIngredientCategoryIds = ingredientCategoriesResult.rows
      .filter((category) => ingredientCategoryNameSet.has(canonicalize(category.name)))
      .map((category) => category.id);

    const usedIngredientCategoryIds = targetIngredientCategoryIds.length
      ? await client.query<{ id: string }>(
          `
          select distinct c.id
          from "ingredient_category" c
          join "ingredient" i on i.category_id = c.id and i.deleted_at is null
          where c.id = any($1::text[]);
          `,
          [targetIngredientCategoryIds],
        )
      : { rows: [] as Array<{ id: string }> };

    const usedIngredientCategorySet = new Set(usedIngredientCategoryIds.rows.map((row) => row.id));
    const deletableIngredientCategoryIds = targetIngredientCategoryIds.filter(
      (id) => !usedIngredientCategorySet.has(id),
    );

    if (config.execute && deletableIngredientCategoryIds.length > 0) {
      await client.query(`delete from "ingredient_category" where id = any($1::text[]);`, [
        deletableIngredientCategoryIds,
      ]);
    }
    console.log(`Categorías de ingrediente eliminables: ${deletableIngredientCategoryIds.length}`);

    const supplyCategoriesResult = await client.query<{ id: string; name: string }>(
      `select id, name from "supply_category";`,
    );
    const supplyCategoryNameSet = new Set(targetSupplyCategoryNames.map((value) => canonicalize(value)));
    const targetSupplyCategoryIds = supplyCategoriesResult.rows
      .filter((category) => supplyCategoryNameSet.has(canonicalize(category.name)))
      .map((category) => category.id);

    const usedSupplyCategoryIds = targetSupplyCategoryIds.length
      ? await client.query<{ id: string }>(
          `
          select distinct c.id
          from "supply_category" c
          join "supply" s on s.category_id = c.id and s.deleted_at is null
          where c.id = any($1::text[]);
          `,
          [targetSupplyCategoryIds],
        )
      : { rows: [] as Array<{ id: string }> };

    const usedSupplyCategorySet = new Set(usedSupplyCategoryIds.rows.map((row) => row.id));
    const deletableSupplyCategoryIds = targetSupplyCategoryIds.filter(
      (id) => !usedSupplyCategorySet.has(id),
    );

    if (config.execute && deletableSupplyCategoryIds.length > 0) {
      await client.query(`delete from "supply_category" where id = any($1::text[]);`, [
        deletableSupplyCategoryIds,
      ]);
    }
    console.log(`Categorías de insumo eliminables: ${deletableSupplyCategoryIds.length}`);

    const productCategoriesResult = await client.query<{
      id: string;
      name: string;
      parent_id: string | null;
    }>(
      `select id, name, parent_id from "product_category";`,
    );
    const productCategoryNameSet = new Set(targetProductCategoryNames.map((value) => canonicalize(value)));
    const targetProductCategoryIds = productCategoriesResult.rows
      .filter((category) => productCategoryNameSet.has(canonicalize(category.name)))
      .map((category) => category.id);

    const usedProductCategoryIds = targetProductCategoryIds.length
      ? await client.query<{ id: string }>(
          `
          select distinct c.id
          from "product_category" c
          left join "product" p on p.category_id = c.id and p.deleted_at is null
          left join "product_category" ch on ch.parent_id = c.id
          where c.id = any($1::text[])
            and (p.id is not null or ch.id is not null);
          `,
          [targetProductCategoryIds],
        )
      : { rows: [] as Array<{ id: string }> };

    const usedProductCategorySet = new Set(usedProductCategoryIds.rows.map((row) => row.id));
    const deletableProductCategoryIds = targetProductCategoryIds.filter(
      (id) => !usedProductCategorySet.has(id),
    );

    if (config.execute && deletableProductCategoryIds.length > 0) {
      await client.query(`delete from "product_category" where id = any($1::text[]);`, [
        deletableProductCategoryIds,
      ]);
    }
    console.log(`Categorías de producto eliminables: ${deletableProductCategoryIds.length}`);

    const unitsResult = await client.query<{ id: string; name: string; abbreviation: string }>(
      `select id, name, abbreviation from "unit";`,
    );
    const targetUnits = unitsResult.rows.filter(
      (unit) =>
        targetUnitCanonical.has(canonicalize(unit.name)) ||
        targetUnitCanonical.has(canonicalize(unit.abbreviation)),
    );
    const targetUnitIds = targetUnits.map((unit) => unit.id);

    const usedUnitIds = targetUnitIds.length
      ? await client.query<{ id: string }>(
          `
          select distinct x.id
          from (
            select u.id
            from "unit" u
            join "product" p on p.unit_id = u.id and p.deleted_at is null
            where u.id = any($1::text[])
            union
            select u.id
            from "unit" u
            join "ingredient" i on i.base_unit_id = u.id and i.deleted_at is null
            where u.id = any($1::text[])
            union
            select u.id
            from "unit" u
            join "supply" s on s.base_unit_id = u.id and s.deleted_at is null
            where u.id = any($1::text[])
            union
            select u.id
            from "unit" u
            join "order_item" oi on oi.unit_id = u.id
            where u.id = any($1::text[])
          ) x;
          `,
          [targetUnitIds],
        )
      : { rows: [] as Array<{ id: string }> };

    const usedUnitSet = new Set(usedUnitIds.rows.map((row) => row.id));
    const deletableUnitIds = targetUnitIds.filter((id) => !usedUnitSet.has(id));

    if (config.execute && deletableUnitIds.length > 0) {
      await client.query(`delete from "unit" where id = any($1::text[]);`, [deletableUnitIds]);
    }
    console.log(`Unidades eliminables: ${deletableUnitIds.length}`);

    const taxResult = await client.query<{ id: string; name: string }>(`select id, name from "tax";`);
    const ivaTax = taxResult.rows.find((tax) => canonicalize(tax.name) === canonicalize("IVA"));

    if (ivaTax) {
      const taxUsage = await client.query<{ count: string }>(
        `
        select (
          (select count(*) from "product_tax" where tax_id = $1) +
          (select count(*) from "order_item_tax" where tax_id = $1) +
          (select count(*) from "ingredient_tax" where tax_id = $1) +
          (select count(*) from "supply_tax" where tax_id = $1)
        )::text as count;
        `,
        [ivaTax.id],
      );

      const usageCount = Number(taxUsage.rows[0]?.count ?? "0");
      if (usageCount === 0 && config.execute) {
        await client.query(`delete from "tax" where id = $1;`, [ivaTax.id]);
      }
      console.log(`IVA eliminable: ${usageCount === 0 ? "SI" : "NO"} (usos: ${usageCount})`);
    } else {
      console.log("IVA no encontrado.");
    }

    for (const organization of popupOrganizations) {
      const counts = await client.query<{
        product_links: string;
        orders_count: string;
        members_count: string;
      }>(
        `
        select
          (select count(*) from "organization_product" where organization_id = $1)::text as product_links,
          (select count(*) from "order" where organization_id = $1)::text as orders_count,
          (select count(*) from "member" where organization_id = $1)::text as members_count;
        `,
        [organization.id],
      );

      const productLinks = Number(counts.rows[0]?.product_links ?? "0");
      const ordersCount = Number(counts.rows[0]?.orders_count ?? "0");
      const membersCount = Number(counts.rows[0]?.members_count ?? "0");

      const canDeleteOrg =
        productLinks === 0 &&
        ordersCount === 0 &&
        canonicalize(organization.address) ===
          canonicalize("Sin direccion fisica (sucursal temporal).");

      if (canDeleteOrg && config.execute) {
        await client.query(`delete from "member" where organization_id = $1;`, [organization.id]);
        await client.query(`delete from "organization" where id = $1;`, [organization.id]);
      }

      console.log(
        `Organización ${organization.id} eliminable: ${canDeleteOrg ? "SI" : "NO"} (products=${productLinks}, orders=${ordersCount}, members=${membersCount})`,
      );
    }

    if (config.execute) {
      await client.query("COMMIT;");
      console.log("------------------------------------------");
      console.log("Rollback ejecutado y confirmado.");
    } else {
      await client.query("ROLLBACK;");
      console.log("------------------------------------------");
      console.log("Dry-run completado. No se persistieron cambios.");
      console.log("Si estás conforme, ejecuta de nuevo con --execute.");
    }
  } catch (error) {
    await client.query("ROLLBACK;").catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
