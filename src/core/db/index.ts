import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { PoolConfig } from "pg";

import { env } from "@core/config/env.config";
import * as schema from "@core/db/schemas";

const { Pool } = pg;

const getDatabaseSslConfig = (): PoolConfig["ssl"] | undefined => {
  if (env.DATABASE_SSL_CA_CERT) {
    return {
      ca: env.DATABASE_SSL_CA_CERT,
      rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED,
    };
  }

  if (!env.DATABASE_SSL_REJECT_UNAUTHORIZED) {
    return {
      rejectUnauthorized: false,
    };
  }

  return undefined;
};

const databaseSslConfig = getDatabaseSslConfig();

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ...(databaseSslConfig ? { ssl: databaseSslConfig } : {}),
});

export const db = drizzle(pool, { schema });

export { schema };
