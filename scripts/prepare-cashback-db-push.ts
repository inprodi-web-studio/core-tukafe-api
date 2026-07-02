import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pool } from "@core/db";

const CASHBACK_MIGRATION_LOCK_KEY = 720260010;

type ExistingTableCheck = {
  hasOrderTable: boolean;
  hasProductCategoryTable: boolean;
  hasCustomerTable: boolean;
  hasOrganizationTable: boolean;
};

async function prepareCashbackDbPush() {
  const client = await pool.connect();

  try {
    const tableCheck = await client.query<ExistingTableCheck>(`
      select
        to_regclass('public."order"') is not null as "hasOrderTable",
        to_regclass('public.product_category') is not null as "hasProductCategoryTable",
        to_regclass('public.customer') is not null as "hasCustomerTable",
        to_regclass('public.organization') is not null as "hasOrganizationTable"
    `);

    const existingTables = tableCheck.rows[0];
    if (
      !existingTables?.hasOrderTable ||
      !existingTables.hasProductCategoryTable ||
      !existingTables.hasCustomerTable ||
      !existingTables.hasOrganizationTable
    ) {
      console.log("[cashback-db-push] Base tables not found; skipping cashback preflight.");
      return;
    }

    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const migrationPath = path.resolve(currentDir, "../drizzle/0010_cashback_program.sql");
    const migrationSql = await fs.readFile(migrationPath, "utf8");

    await client.query("begin;");
    await client.query("select pg_advisory_xact_lock($1);", [CASHBACK_MIGRATION_LOCK_KEY]);
    await client.query(migrationSql);
    await client.query("commit;");

    console.log("[cashback-db-push] Cashback schema preflight applied.");
  } catch (error) {
    try {
      await client.query("rollback;");
    } catch {
      // Ignore rollback failures; the original error is more useful.
    }

    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

prepareCashbackDbPush().catch((error) => {
  console.error("[cashback-db-push] Error:", error);
  process.exit(1);
});
