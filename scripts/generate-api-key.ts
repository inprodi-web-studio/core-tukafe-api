import type { db as database } from "@core/db";

type ApiKeyPermissions = Record<string, string[]>;

type Database = typeof database;

type ApiKeyCreateBody = {
  expiresIn: number | null;
  name: string;
  permissions?: ApiKeyPermissions;
  prefix?: string;
  remaining: number | null;
  userId: string;
};

type ApiKeyCreateResult = {
  createdAt: Date | string;
  expiresAt: Date | string | null;
  id: string;
  key: string;
  name: string | null;
  prefix: string | null;
  start: string | null;
};

type AuthWithApiKey = {
  api: {
    createApiKey(input: { body: ApiKeyCreateBody }): Promise<ApiKeyCreateResult>;
  };
};

type CliOptions = {
  expiresInSeconds: number | null;
  name: string | null;
  ownerUserEmail: string | null;
  ownerUserId: string | null;
  permissions: ApiKeyPermissions | undefined;
  prefix: string | undefined;
  remaining: number | null;
};

const HELP = `
Genera un API key usando la configuración de Better Auth.

Uso:
  yarn api-key:generate --name "iPad producción" --user-email admin@tukafe.com

Opciones:
  --name <texto>                  Nombre del API key. Requerido.
  --user-email <email>            Email del usuario dueño del API key.
  --user-id <id>                  ID del usuario dueño del API key.
  --expires-in-seconds <numero>   Tiempo de expiración en segundos. Opcional.
  --prefix <texto>                Prefijo del API key. Opcional; por defecto usa guest_.
  --remaining <numero>            Usos restantes. Opcional; null significa sin límite.
  --permissions <json>            Permisos en JSON. Ej: '{"orders":["read"]}'.

Variables de entorno alternativas:
  API_KEY_NAME
  API_KEY_OWNER_EMAIL
  API_KEY_OWNER_ID
  API_KEY_EXPIRES_IN_SECONDS
  API_KEY_PREFIX
  API_KEY_REMAINING
  API_KEY_PERMISSIONS
`.trim();

function getArgValue(args: string[], index: number, flag: string) {
  const value = args[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`Falta el valor para ${flag}.`);
  }

  return value;
}

function parsePositiveInteger(value: string, label: string) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} debe ser un entero positivo.`);
  }

  return parsed;
}

function parseNonNegativeInteger(value: string, label: string) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} debe ser un entero mayor o igual a cero.`);
  }

  return parsed;
}

function parsePermissions(value: string): ApiKeyPermissions {
  const parsed = JSON.parse(value) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--permissions debe ser un objeto JSON.");
  }

  for (const [permission, actions] of Object.entries(parsed)) {
    if (!Array.isArray(actions) || actions.some((action) => typeof action !== "string")) {
      throw new Error(`El permiso "${permission}" debe tener un arreglo de strings.`);
    }
  }

  return parsed as ApiKeyPermissions;
}

function parseOptions(): CliOptions {
  const options: CliOptions = {
    expiresInSeconds: process.env.API_KEY_EXPIRES_IN_SECONDS
      ? parsePositiveInteger(process.env.API_KEY_EXPIRES_IN_SECONDS, "API_KEY_EXPIRES_IN_SECONDS")
      : null,
    name: process.env.API_KEY_NAME?.trim() || null,
    ownerUserEmail: process.env.API_KEY_OWNER_EMAIL?.trim() || null,
    ownerUserId: process.env.API_KEY_OWNER_ID?.trim() || null,
    permissions: process.env.API_KEY_PERMISSIONS
      ? parsePermissions(process.env.API_KEY_PERMISSIONS)
      : undefined,
    prefix: process.env.API_KEY_PREFIX?.trim() || undefined,
    remaining: process.env.API_KEY_REMAINING
      ? parseNonNegativeInteger(process.env.API_KEY_REMAINING, "API_KEY_REMAINING")
      : null,
  };

  const args = process.argv.slice(2);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--help":
      case "-h":
        console.log(HELP);
        process.exit(0);
        break;
      case "--name":
        options.name = getArgValue(args, index, arg).trim();
        index += 1;
        break;
      case "--user-email":
        options.ownerUserEmail = getArgValue(args, index, arg).trim();
        index += 1;
        break;
      case "--user-id":
        options.ownerUserId = getArgValue(args, index, arg).trim();
        index += 1;
        break;
      case "--expires-in-seconds":
        options.expiresInSeconds = parsePositiveInteger(getArgValue(args, index, arg), arg);
        index += 1;
        break;
      case "--prefix":
        options.prefix = getArgValue(args, index, arg).trim();
        index += 1;
        break;
      case "--remaining":
        options.remaining = parseNonNegativeInteger(getArgValue(args, index, arg), arg);
        index += 1;
        break;
      case "--permissions":
        options.permissions = parsePermissions(getArgValue(args, index, arg));
        index += 1;
        break;
      default:
        throw new Error(`Opción desconocida: ${arg}. Usa --help para ver las opciones.`);
    }
  }

  if (!options.name) {
    throw new Error("Debes indicar --name o API_KEY_NAME.");
  }

  if (!options.ownerUserId && !options.ownerUserEmail) {
    throw new Error("Debes indicar --user-email, --user-id, API_KEY_OWNER_EMAIL o API_KEY_OWNER_ID.");
  }

  return options;
}

async function resolveOwnerUserId(options: CliOptions, database: Database) {
  if (options.ownerUserId) {
    return options.ownerUserId;
  }

  const user = await database.query.userDB.findFirst({
    where(userDB, { eq }) {
      return eq(userDB.email, options.ownerUserEmail ?? "");
    },
  });

  if (!user) {
    throw new Error(`No existe un usuario con email ${options.ownerUserEmail}.`);
  }

  return user.id;
}

function toIsoString(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function main() {
  const options = parseOptions();
  const [{ auth }, { db, pool }] = await Promise.all([
    import("@core/config/auth.config"),
    import("@core/db"),
  ]);

  try {
    const ownerUserId = await resolveOwnerUserId(options, db);
    const apiKey = await (auth as unknown as AuthWithApiKey).api.createApiKey({
      body: {
        name: options.name ?? "",
        userId: ownerUserId,
        expiresIn: options.expiresInSeconds,
        prefix: options.prefix,
        remaining: options.remaining,
        permissions: options.permissions,
      },
    });

    console.log(
      JSON.stringify(
        {
          id: apiKey.id,
          name: apiKey.name,
          ownerUserId,
          prefix: apiKey.prefix,
          start: apiKey.start,
          key: apiKey.key,
          expiresAt: toIsoString(apiKey.expiresAt),
          createdAt: toIsoString(apiKey.createdAt),
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[api-key] Error: ${message}`);
    process.exitCode = 1;
  });
