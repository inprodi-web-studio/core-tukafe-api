import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const nodeArgs: string[] = [];
const envFilePath = path.resolve(process.cwd(), ".env");

if (existsSync(envFilePath)) {
  nodeArgs.push("--env-file=.env");
}

nodeArgs.push("--import", "tsx", "scripts/sync-product-modifier-options.ts", ...args);

const result = spawnSync(process.execPath, nodeArgs, {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  console.error(`Error sincronizando opciones por producto: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
