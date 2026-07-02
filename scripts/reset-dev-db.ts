import { spawnSync } from "node:child_process";
import pg from "pg";

const { Pool } = pg;

interface ResetOptions {
  yes: boolean;
  skipSchemaSync: boolean;
  seed: boolean;
}

const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function parseArgs(argv: string[]): ResetOptions {
  const flags = new Set<string>();

  for (const arg of argv) {
    if (arg === "--") {
      continue;
    }

    if (!arg.startsWith("--")) {
      throw new Error(`Argumento inesperado: ${arg}`);
    }

    const flag = arg.slice(2);

    if (flag !== "yes" && flag !== "skip-migrate" && flag !== "skip-sync" && flag !== "seed") {
      throw new Error(`Opción desconocida: --${flag}`);
    }

    flags.add(flag);
  }

  return {
    yes: flags.has("yes"),
    skipSchemaSync: flags.has("skip-migrate") || flags.has("skip-sync"),
    seed: flags.has("seed"),
  };
}

function redactDatabaseUrl(databaseUrl: string) {
  const url = new URL(databaseUrl);

  if (url.password) {
    url.password = "********";
  }

  return url.toString();
}

function assertDevelopmentDatabase(databaseUrl: string, nodeEnv: string) {
  if (nodeEnv !== "development") {
    throw new Error(
      `Reset bloqueado: NODE_ENV debe ser "development", valor actual "${nodeEnv}".`,
    );
  }

  const url = new URL(databaseUrl);

  if (!LOCAL_DATABASE_HOSTS.has(url.hostname)) {
    throw new Error(
      `Reset bloqueado: DATABASE_URL debe apuntar a una base local. Host actual "${url.hostname}".`,
    );
  }
}

function runCommand(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw new Error(`No se pudo ejecutar ${command}: ${result.error.message}`);
  }

  if ((result.status ?? 1) !== 0) {
    throw new Error(`${command} ${args.join(" ")} terminó con código ${result.status ?? 1}.`);
  }
}

async function resetDevelopmentDatabase() {
  const options = parseArgs(process.argv.slice(2));
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("Falta DATABASE_URL en el entorno.");
  }

  assertDevelopmentDatabase(databaseUrl, nodeEnv);

  if (!options.yes) {
    throw new Error(
      [
        "Reset bloqueado: agrega --yes para confirmar la eliminación completa de la base de desarrollo.",
        "Ejemplo: yarn db:reset:dev -- --yes",
      ].join(" "),
    );
  }

  console.log("[db:reset:dev] Base objetivo:", redactDatabaseUrl(databaseUrl));
  console.log("[db:reset:dev] Eliminando schema public...");

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    await client.query("drop schema if exists public cascade;");
    await client.query("create schema public;");
    await client.query("grant all on schema public to public;");
  } finally {
    client.release();
    await pool.end();
  }

  console.log("[db:reset:dev] Base limpia.");

  if (!options.skipSchemaSync) {
    console.log("[db:reset:dev] Sincronizando schema actual...");
    runCommand("yarn", ["db:push"]);
  }

  if (options.seed) {
    console.log("[db:reset:dev] Ejecutando seed...");
    runCommand("yarn", ["db:seed"]);
  }

  console.log("[db:reset:dev] Finalizado.");
}

resetDevelopmentDatabase().catch((error) => {
  console.error("[db:reset:dev] Error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
