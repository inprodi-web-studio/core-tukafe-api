import { defineConfig } from "drizzle-kit";

import { env } from "@core/config/env.config";

export default defineConfig({
  schema: "./src/core/db/schemas",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL!,
  },
});
