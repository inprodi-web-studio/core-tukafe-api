import { defineConfig } from "drizzle-kit";

import { env } from "@core/config/env.config";

const getDbCredentials = () => {
  if (!env.DATABASE_SSL_CA_CERT && env.DATABASE_SSL_REJECT_UNAUTHORIZED) {
    return {
      url: env.DATABASE_URL,
    };
  }

  const databaseUrl = new URL(env.DATABASE_URL);
  const pathname = databaseUrl.pathname.startsWith("/")
    ? databaseUrl.pathname.slice(1)
    : databaseUrl.pathname;

  return {
    host: databaseUrl.hostname,
    port: databaseUrl.port ? Number(databaseUrl.port) : undefined,
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    database: decodeURIComponent(pathname),
    ssl: {
      ...(env.DATABASE_SSL_CA_CERT ? { ca: env.DATABASE_SSL_CA_CERT } : {}),
      rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED,
    },
  };
};

export default defineConfig({
  schema: "./src/core/db/schemas",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: getDbCredentials(),
});
