import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import { env } from "@core/config/env.config";
import * as schema from "@core/db/schemas";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

export { schema };
