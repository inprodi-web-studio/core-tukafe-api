import fs from "node:fs/promises";
import path from "node:path";

import { hashPassword } from "better-auth/crypto";
import { parsePhoneNumberWithError } from "libphonenumber-js";
import type { PoolClient } from "pg";

import { pool } from "@core/db";
import { generateNanoId } from "@core/utils";

type CsvRow = Record<string, string> & { __line: number };

interface CsvTable {
  fileName: string;
  filePath: string;
  headers: string[];
  rows: CsvRow[];
}

interface ImportConfig {
  csvDir: string;
  apply: boolean;
  skipUsers: boolean;
  skipCashback: boolean;
  overwriteCashback: boolean;
  reportDir: string | null;
}

interface CustomerInput {
  line: number;
  phone: string;
  name: string | null;
  middleName: string | null;
  lastName: string | null;
  email: string | null;
  birthdate: string | null;
  gender: string | null;
  groupName: string | null;
}

interface UserInput {
  line: number;
  customerPhone: string;
  email: string;
  phone: string;
  name: string;
  middleName: string | null;
  lastName: string | null;
  phoneVerified: boolean;
  emailVerified: boolean;
  active: boolean;
  passwordMode: string;
  passwordHash: string | null;
  passwordAlgorithm: string | null;
  passwordParameters: string | null;
  temporaryPassword: string | null;
}

interface CashbackInput {
  line: number;
  customerPhone: string;
  balanceCents: number;
  totalEarnedCents: number;
  totalRedeemedCents: number;
}

interface DbCustomer {
  id: string;
  phone: string | null;
  userId: string | null;
  balanceCents?: number;
  totalEarnedCents?: number;
  totalRedeemedCents?: number;
}

interface ExistingUser {
  id: string;
  email: string;
  phoneNumber: string | null;
}

interface ImportStats {
  customers: {
    read: number;
    created: number;
    updated: number;
    unchanged: number;
    groupsCreated: number;
  };
  users: {
    read: number;
    created: number;
    updated: number;
    linkedCustomers: number;
    legacyPasswordsStored: number;
    betterAuthPasswordsStored: number;
    skippedExistingPasswords: number;
  };
  cashback: {
    read: number;
    created: number;
    updated: number;
    unchanged: number;
    totalBalanceCents: number;
  };
}

const REQUIRED_CLIENT_HEADERS = [
  "telefono",
  "nombres",
  "apellido_paterno",
  "apellido_materno",
  "correo",
  "fecha_nacimiento",
  "genero",
  "grupo_cliente",
] as const;

const REQUIRED_USER_HEADERS = [
  "telefono_cliente",
  "correo_login",
  "telefono_login",
  "nombres",
  "apellido_paterno",
  "apellido_materno",
  "telefono_verificado",
  "correo_verificado",
  "usuario_activo",
  "password_modo",
  "password_hash_actual",
  "password_algoritmo",
  "password_parametros",
  "password_secret_env",
  "password_temporal",
  "forzar_cambio_password",
] as const;

const REQUIRED_CASHBACK_HEADERS = [
  "telefono_cliente",
  "saldo_cashback_mxn",
  "total_ganado_historico_mxn",
  "total_canjeado_historico_mxn",
  "fecha_saldo",
  "motivo",
  "observaciones",
] as const;

const IMPORT_LOCK_KEY = 720250020;

function parseArgs(argv: string[]): ImportConfig {
  const options = new Map<string, string>();
  const flags = new Set<string>();

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";

    if (arg === "--") {
      continue;
    }

    if (!arg.startsWith("--")) {
      throw new Error(`Argumento inesperado: ${arg}`);
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const key = rawKey ?? "";

    if (
      key === "apply" ||
      key === "skip-users" ||
      key === "skip-cashback" ||
      key === "overwrite-cashback"
    ) {
      flags.add(key);
      continue;
    }

    const value = inlineValue ?? argv[i + 1];

    if (!value || value.startsWith("--")) {
      throw new Error(`Falta valor para --${key}`);
    }

    options.set(key, value);

    if (inlineValue === undefined) {
      i += 1;
    }
  }

  return {
    csvDir: path.resolve(options.get("csv-dir") ?? "templates/importacion-clientes"),
    apply: flags.has("apply"),
    skipUsers: flags.has("skip-users"),
    skipCashback: flags.has("skip-cashback"),
    overwriteCashback: flags.has("overwrite-cashback"),
    reportDir: options.has("report-dir") ? path.resolve(options.get("report-dir")!) : null,
  };
}

function cleanText(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function toNullable(value: string | null | undefined) {
  const normalized = cleanText(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizeEmail(value: string | null | undefined) {
  const email = cleanText(value).toLowerCase();

  if (!email) {
    return null;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`Correo inválido: ${value}`);
  }

  return email;
}

function nameFromEmail(email: string) {
  const localPart = email.split("@")[0] ?? "cliente";
  const cleaned = localPart
    .replace(/[._-]+/g, " ")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, " ");

  return cleaned.length > 0 ? cleaned : "cliente";
}

function normalizePhone(value: string | null | undefined) {
  const phone = cleanText(value);

  if (!phone) {
    return null;
  }

  try {
    const parsed = parsePhoneNumberWithError(phone);

    if (!parsed.isValid()) {
      throw new Error("invalid");
    }

    return parsed.number;
  } catch {
    throw new Error(`Teléfono inválido: ${value}`);
  }
}

function parsePhoneCell(table: CsvTable, row: CsvRow, key: string, required = false) {
  const value = getCell(table, row, key, { required });

  try {
    return normalizePhone(value);
  } catch {
    throw new Error(
      `Teléfono inválido en ${table.fileName}:${row.__line} columna "${key}" => "${value}".`,
    );
  }
}

function parseYesNo(table: CsvTable, row: CsvRow, key: string, fallback = false) {
  const value = getCell(table, row, key).toLowerCase();

  if (!value) {
    return fallback;
  }

  if (value === "si" || value === "sí" || value === "true" || value === "1") {
    return true;
  }

  if (value === "no" || value === "false" || value === "0") {
    return false;
  }

  throw new Error(
    `Valor booleano inválido en ${table.fileName}:${row.__line} columna "${key}" => "${value}". Usa SI/NO.`,
  );
}

function parseDate(table: CsvTable, row: CsvRow, key: string) {
  const value = getCell(table, row, key);

  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(
      `Fecha inválida en ${table.fileName}:${row.__line} columna "${key}" => "${value}". Usa YYYY-MM-DD.`,
    );
  }

  return value;
}

function parseMoneyCents(table: CsvTable, row: CsvRow, key: string, required = false) {
  const value = getCell(table, row, key, { required });

  if (!value) {
    return null;
  }

  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new Error(
      `Monto inválido en ${table.fileName}:${row.__line} columna "${key}" => "${value}". Usa hasta 2 decimales.`,
    );
  }

  const [whole, decimal = ""] = value.split(".");
  return Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
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
        const next = text[i + 1];

        if (next === "\"") {
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
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  row.push(field);
  rows.push(row);

  const headers = (rows[0] ?? []).map(cleanText);
  const records: CsvRow[] = [];

  for (let i = 1; i < rows.length; i += 1) {
    const raw = rows[i] ?? [];

    if (raw.every((value) => cleanText(value).length === 0)) {
      continue;
    }

    const record = { __line: i + 1 } as CsvRow;

    headers.forEach((header, index) => {
      record[header] = cleanText(raw[index]);
    });

    records.push(record);
  }

  return { headers, records };
}

async function loadCsvTable(csvDir: string, fileName: string): Promise<CsvTable> {
  const filePath = path.join(csvDir, fileName);
  const content = await fs.readFile(filePath, "utf8");
  const parsed = parseCsv(content);

  return {
    fileName,
    filePath,
    headers: parsed.headers,
    rows: parsed.records,
  };
}

function assertHeaders(table: CsvTable, requiredHeaders: readonly string[]) {
  const missing = requiredHeaders.filter((header) => !table.headers.includes(header));

  if (missing.length > 0) {
    throw new Error(`Faltan columnas en ${table.fileName}: ${missing.join(", ")}`);
  }
}

function getCell(table: CsvTable, row: CsvRow, key: string, { required = false } = {}) {
  if (!(key in row)) {
    throw new Error(`Falta la columna "${key}" en ${table.fileName}.`);
  }

  const value = cleanText(row[key]);

  if (required && !value) {
    throw new Error(`Campo requerido vacío: ${table.fileName}:${row.__line} columna "${key}".`);
  }

  return value;
}

function createEmptyStats(): ImportStats {
  return {
    customers: {
      read: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      groupsCreated: 0,
    },
    users: {
      read: 0,
      created: 0,
      updated: 0,
      linkedCustomers: 0,
      legacyPasswordsStored: 0,
      betterAuthPasswordsStored: 0,
      skippedExistingPasswords: 0,
    },
    cashback: {
      read: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      totalBalanceCents: 0,
    },
  };
}

function normalizeClients(table: CsvTable) {
  assertHeaders(table, REQUIRED_CLIENT_HEADERS);

  const seenPhones = new Map<string, number>();

  return table.rows.map<CustomerInput>((row) => {
    const phone = parsePhoneCell(table, row, "telefono", true)!;
    const email = normalizeEmail(getCell(table, row, "correo"));

    if (seenPhones.has(phone)) {
      throw new Error(
        `Teléfono de cliente duplicado en ${table.fileName}: ${phone} líneas ${seenPhones.get(
          phone,
        )} y ${row.__line}.`,
      );
    }

    seenPhones.set(phone, row.__line);

    return {
      line: row.__line,
      phone,
      name: toNullable(getCell(table, row, "nombres")),
      middleName: toNullable(getCell(table, row, "apellido_paterno")),
      lastName: toNullable(getCell(table, row, "apellido_materno")),
      email,
      birthdate: parseDate(table, row, "fecha_nacimiento"),
      gender: toNullable(getCell(table, row, "genero")),
      groupName: toNullable(getCell(table, row, "grupo_cliente")),
    };
  });
}

function normalizeUsers(table: CsvTable, clientsByPhone: Map<string, CustomerInput>) {
  assertHeaders(table, REQUIRED_USER_HEADERS);

  const seenEmails = new Map<string, number>();
  const seenPhones = new Map<string, number>();

  return table.rows.map<UserInput>((row) => {
    const customerPhone = parsePhoneCell(table, row, "telefono_cliente", true)!;
    const email = normalizeEmail(getCell(table, row, "correo_login", { required: true }))!;
    const phone =
      parsePhoneCell(table, row, "telefono_login") ??
      parsePhoneCell(table, row, "telefono_cliente", true)!;
    const client = clientsByPhone.get(customerPhone);

    if (!client) {
      throw new Error(
        `Usuario ${table.fileName}:${row.__line} apunta a teléfono_cliente sin cliente: ${customerPhone}`,
      );
    }

    if (seenEmails.has(email)) {
      throw new Error(
        `Correo de usuario duplicado en ${table.fileName}: ${email} líneas ${seenEmails.get(
          email,
        )} y ${row.__line}.`,
      );
    }

    if (seenPhones.has(phone)) {
      throw new Error(
        `Teléfono de login duplicado en ${table.fileName}: ${phone} líneas ${seenPhones.get(
          phone,
        )} y ${row.__line}.`,
      );
    }

    seenEmails.set(email, row.__line);
    seenPhones.set(phone, row.__line);

    const name = toNullable(getCell(table, row, "nombres")) ?? client.name ?? nameFromEmail(email);

    return {
      line: row.__line,
      customerPhone,
      email,
      phone,
      name,
      middleName: toNullable(getCell(table, row, "apellido_paterno")) ?? client.middleName,
      lastName: toNullable(getCell(table, row, "apellido_materno")) ?? client.lastName,
      phoneVerified: parseYesNo(table, row, "telefono_verificado"),
      emailVerified: parseYesNo(table, row, "correo_verificado"),
      active: parseYesNo(table, row, "usuario_activo", true),
      passwordMode: getCell(table, row, "password_modo", { required: true }),
      passwordHash: toNullable(getCell(table, row, "password_hash_actual")),
      passwordAlgorithm: toNullable(getCell(table, row, "password_algoritmo")),
      passwordParameters: toNullable(getCell(table, row, "password_parametros")),
      temporaryPassword: toNullable(getCell(table, row, "password_temporal")),
    };
  });
}

function normalizeCashback(table: CsvTable, clientsByPhone: Map<string, CustomerInput>) {
  assertHeaders(table, REQUIRED_CASHBACK_HEADERS);

  const seenPhones = new Map<string, number>();

  return table.rows.map<CashbackInput>((row) => {
    const customerPhone = parsePhoneCell(table, row, "telefono_cliente", true)!;

    if (!clientsByPhone.has(customerPhone)) {
      throw new Error(
        `Cashback ${table.fileName}:${row.__line} apunta a teléfono_cliente sin cliente: ${customerPhone}`,
      );
    }

    if (seenPhones.has(customerPhone)) {
      throw new Error(
        `Teléfono de cashback duplicado en ${table.fileName}: ${customerPhone} líneas ${seenPhones.get(
          customerPhone,
        )} y ${row.__line}.`,
      );
    }

    seenPhones.set(customerPhone, row.__line);

    const balanceCents = parseMoneyCents(table, row, "saldo_cashback_mxn", true)!;
    const totalEarnedCents =
      parseMoneyCents(table, row, "total_ganado_historico_mxn") ?? balanceCents;
    const totalRedeemedCents =
      parseMoneyCents(table, row, "total_canjeado_historico_mxn") ?? 0;

    if (totalEarnedCents - totalRedeemedCents !== balanceCents) {
      throw new Error(
        `Cashback no cuadra en ${table.fileName}:${row.__line}. total_ganado - total_canjeado debe ser saldo.`,
      );
    }

    return {
      line: row.__line,
      customerPhone,
      balanceCents,
      totalEarnedCents,
      totalRedeemedCents,
    };
  });
}

async function loadExistingCustomers(client: PoolClient) {
  const result = await client.query<{
    id: string;
    phone: string | null;
    user_id: string | null;
  }>('select id, phone, user_id from "customer" where deleted_at is null and phone is not null;');

  return new Map(
    result.rows.map((row) => [
      row.phone!,
      {
        id: row.id,
        phone: row.phone,
        userId: row.user_id,
      } satisfies DbCustomer,
    ]),
  );
}

async function loadCustomerGroups(client: PoolClient) {
  const result = await client.query<{ id: string; name: string }>(
    'select id, name from "customer_group";',
  );

  return new Map(result.rows.map((row) => [row.name, row.id]));
}

async function ensureCustomerGroup(
  client: PoolClient,
  input: { name: string; apply: boolean; groupsByName: Map<string, string>; stats: ImportStats },
) {
  const existingId = input.groupsByName.get(input.name);

  if (existingId) {
    return existingId;
  }

  const id = generateNanoId();
  input.groupsByName.set(input.name, id);
  input.stats.customers.groupsCreated += 1;

  if (input.apply) {
    await client.query(
      'insert into "customer_group" (id, name) values ($1, $2) on conflict (name) do nothing;',
      [id, input.name],
    );

    const persisted = await client.query<{ id: string }>(
      'select id from "customer_group" where name = $1 limit 1;',
      [input.name],
    );

    return persisted.rows[0]?.id ?? id;
  }

  return id;
}

function customerNeedsUpdate(existing: DbCustomer, input: CustomerInput, groupId: string | null) {
  return Boolean(input.name || input.middleName || input.lastName || input.email || input.birthdate || input.gender || groupId);
}

async function importCustomers(
  client: PoolClient,
  inputs: CustomerInput[],
  config: ImportConfig,
  stats: ImportStats,
) {
  const customersByPhone = await loadExistingCustomers(client);
  const groupsByName = await loadCustomerGroups(client);

  stats.customers.read = inputs.length;

  for (const input of inputs) {
    const groupId = input.groupName
      ? await ensureCustomerGroup(client, {
          name: input.groupName,
          apply: config.apply,
          groupsByName,
          stats,
        })
      : null;
    const existing = customersByPhone.get(input.phone);

    if (!existing) {
      const id = generateNanoId();
      stats.customers.created += 1;
      customersByPhone.set(input.phone, { id, phone: input.phone, userId: null });

      if (config.apply) {
        await client.query(
          `insert into "customer"
             (id, phone, name, middle_name, last_name, email, birthdate, gender, group_id, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now());`,
          [
            id,
            input.phone,
            input.name,
            input.middleName,
            input.lastName,
            input.email,
            input.birthdate,
            input.gender,
            groupId,
          ],
        );
      }

      continue;
    }

    if (customerNeedsUpdate(existing, input, groupId)) {
      stats.customers.updated += 1;

      if (config.apply) {
        await client.query(
          `update "customer"
           set
             name = coalesce($1, name),
             middle_name = coalesce($2, middle_name),
             last_name = coalesce($3, last_name),
             email = coalesce($4, email),
             birthdate = coalesce($5, birthdate),
             gender = coalesce($6, gender),
             group_id = coalesce($7, group_id),
             updated_at = now()
           where id = $8;`,
          [
            input.name,
            input.middleName,
            input.lastName,
            input.email,
            input.birthdate,
            input.gender,
            groupId,
            existing.id,
          ],
        );
      }
    } else {
      stats.customers.unchanged += 1;
    }
  }

  return customersByPhone;
}

async function findExistingUser(client: PoolClient, input: UserInput) {
  const result = await client.query<{
    id: string;
    email: string;
    phone_number: string | null;
  }>(
    `select id, email, phone_number
     from "user"
     where email = $1 or phone_number = $2;`,
    [input.email, input.phone],
  );

  if (result.rows.length === 0) {
    return null;
  }

  const ids = new Set(result.rows.map((row) => row.id));

  if (ids.size > 1) {
    throw new Error(
      `Conflicto usuario ${input.email}: correo y teléfono pertenecen a usuarios distintos.`,
    );
  }

  const row = result.rows[0]!;

  return {
    id: row.id,
    email: row.email,
    phoneNumber: row.phone_number,
  } satisfies ExistingUser;
}

async function accountHasPassword(client: PoolClient, userId: string) {
  const result = await client.query<{ password: string | null }>(
    `select password
     from "account"
     where user_id = $1 and provider_id = 'credential'
     limit 1;`,
    [userId],
  );

  return Boolean(result.rows[0]?.password);
}

async function upsertBetterAuthPassword(
  client: PoolClient,
  input: { userId: string; passwordHash: string; apply: boolean; stats: ImportStats },
) {
  if (await accountHasPassword(client, input.userId)) {
    input.stats.users.skippedExistingPasswords += 1;
    return;
  }

  input.stats.users.betterAuthPasswordsStored += 1;

  if (!input.apply) {
    return;
  }

  await client.query(
    `insert into "account"
       (id, user_id, account_id, provider_id, password, created_at, updated_at)
     values ($1, $2, $2, 'credential', $3, now(), now())
     on conflict (provider_id, account_id)
     do update set password = coalesce("account"."password", excluded.password), updated_at = now();`,
    [generateNanoId(), input.userId, input.passwordHash],
  );
}

async function upsertLegacyPassword(
  client: PoolClient,
  input: {
    userId: string;
    passwordHash: string;
    algorithm: string;
    parameters: string | null;
    apply: boolean;
    stats: ImportStats;
  },
) {
  if (await accountHasPassword(client, input.userId)) {
    input.stats.users.skippedExistingPasswords += 1;
    return;
  }

  input.stats.users.legacyPasswordsStored += 1;

  if (!input.apply) {
    return;
  }

  await client.query(
    `insert into "legacy_customer_password"
       (user_id, password_hash, algorithm, parameters, created_at, updated_at)
     values ($1, $2, $3, $4, now(), now())
     on conflict (user_id)
     do update set
       password_hash = excluded.password_hash,
       algorithm = excluded.algorithm,
       parameters = excluded.parameters,
       updated_at = now();`,
    [input.userId, input.passwordHash, input.algorithm, input.parameters],
  );
}

async function persistPassword(
  client: PoolClient,
  input: UserInput,
  userId: string,
  config: ImportConfig,
  stats: ImportStats,
) {
  if (input.passwordMode === "sin_acceso") {
    return;
  }

  if (input.passwordMode === "migracion_primer_login") {
    if (input.passwordAlgorithm !== "legacy-bcrypt") {
      throw new Error(
        `Usuario línea ${input.line}: migracion_primer_login solo soporta legacy-bcrypt por ahora.`,
      );
    }

    if (!input.passwordHash) {
      throw new Error(`Usuario línea ${input.line}: falta password_hash_actual.`);
    }

    await upsertLegacyPassword(client, {
      userId,
      passwordHash: input.passwordHash,
      algorithm: input.passwordAlgorithm,
      parameters: input.passwordParameters,
      apply: config.apply,
      stats,
    });
    return;
  }

  if (input.passwordMode === "hash_better_auth") {
    if (!input.passwordHash) {
      throw new Error(`Usuario línea ${input.line}: falta password_hash_actual.`);
    }

    await upsertBetterAuthPassword(client, {
      userId,
      passwordHash: input.passwordHash,
      apply: config.apply,
      stats,
    });
    return;
  }

  if (input.passwordMode === "reset_temporal") {
    if (!input.temporaryPassword) {
      throw new Error(`Usuario línea ${input.line}: falta password_temporal.`);
    }

    await upsertBetterAuthPassword(client, {
      userId,
      passwordHash: await hashPassword(input.temporaryPassword),
      apply: config.apply,
      stats,
    });
    return;
  }

  throw new Error(`Usuario línea ${input.line}: password_modo inválido "${input.passwordMode}".`);
}

async function importUsers(
  client: PoolClient,
  inputs: UserInput[],
  customersByPhone: Map<string, DbCustomer>,
  config: ImportConfig,
  stats: ImportStats,
) {
  stats.users.read = inputs.length;

  for (const input of inputs) {
    const targetCustomer = customersByPhone.get(input.customerPhone);

    if (!targetCustomer) {
      throw new Error(`No existe cliente para usuario línea ${input.line}: ${input.customerPhone}`);
    }

    const existingUser = await findExistingUser(client, input);
    const userId = existingUser?.id ?? generateNanoId();

    if (existingUser) {
      stats.users.updated += 1;

      if (config.apply) {
        await client.query(
          `update "user"
           set
             name = $1,
             middle_name = $2,
             last_name = $3,
             email = $4,
             email_verified = $5,
             phone_number = $6,
             phone_number_verified = $7,
             role = 'customer',
             banned = $8,
             updated_at = now()
           where id = $9;`,
          [
            input.name,
            input.middleName,
            input.lastName,
            input.email,
            input.emailVerified,
            input.phone,
            input.phoneVerified,
            !input.active,
            userId,
          ],
        );
      }
    } else {
      stats.users.created += 1;

      if (config.apply) {
        await client.query(
          `insert into "user"
             (id, name, middle_name, last_name, email, email_verified, phone_number, phone_number_verified, role, banned, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, 'customer', $9, now(), now());`,
          [
            userId,
            input.name,
            input.middleName,
            input.lastName,
            input.email,
            input.emailVerified,
            input.phone,
            input.phoneVerified,
            !input.active,
          ],
        );
      }
    }

    const customerByUser = await client.query<{ id: string; phone: string | null }>(
      'select id, phone from "customer" where user_id = $1 and deleted_at is null limit 1;',
      [userId],
    );
    const existingCustomerForUser = customerByUser.rows[0];

    if (existingCustomerForUser && existingCustomerForUser.id !== targetCustomer.id) {
      throw new Error(
        `Usuario ${input.email} ya está ligado al cliente ${existingCustomerForUser.phone ?? existingCustomerForUser.id}, no a ${input.customerPhone}.`,
      );
    }

    if (targetCustomer.userId && targetCustomer.userId !== userId) {
      throw new Error(
        `Cliente ${input.customerPhone} ya está ligado a otro usuario (${targetCustomer.userId}).`,
      );
    }

    if (targetCustomer.userId !== userId) {
      stats.users.linkedCustomers += 1;
      targetCustomer.userId = userId;

      if (config.apply) {
        await client.query(
          `update "customer"
           set user_id = $1, email = coalesce(email, $2), updated_at = now()
           where id = $3;`,
          [userId, input.email, targetCustomer.id],
        );
      }
    }

    await persistPassword(client, input, userId, config, stats);
  }
}

async function importCashback(
  client: PoolClient,
  inputs: CashbackInput[],
  customersByPhone: Map<string, DbCustomer>,
  config: ImportConfig,
  stats: ImportStats,
) {
  stats.cashback.read = inputs.length;

  for (const input of inputs) {
    const customer = customersByPhone.get(input.customerPhone);

    if (!customer) {
      throw new Error(`No existe cliente para cashback línea ${input.line}: ${input.customerPhone}`);
    }

    stats.cashback.totalBalanceCents += input.balanceCents;

    const existing = await client.query<{
      balance_cents: number;
      total_earned_cents: number;
      total_redeemed_cents: number;
    }>(
      `select balance_cents, total_earned_cents, total_redeemed_cents
       from "customer_cashback_account"
       where customer_id = $1
       limit 1;`,
      [customer.id],
    );

    const existingAccount = existing.rows[0];

    if (!existingAccount) {
      stats.cashback.created += 1;

      if (config.apply) {
        await client.query(
          `insert into "customer_cashback_account"
             (customer_id, balance_cents, total_earned_cents, total_redeemed_cents, version, created_at, updated_at)
           values ($1, $2, $3, $4, 0, now(), now());`,
          [customer.id, input.balanceCents, input.totalEarnedCents, input.totalRedeemedCents],
        );
      }

      continue;
    }

    const isSame =
      existingAccount.balance_cents === input.balanceCents &&
      existingAccount.total_earned_cents === input.totalEarnedCents &&
      existingAccount.total_redeemed_cents === input.totalRedeemedCents;

    if (isSame) {
      stats.cashback.unchanged += 1;
      continue;
    }

    const isZero =
      existingAccount.balance_cents === 0 &&
      existingAccount.total_earned_cents === 0 &&
      existingAccount.total_redeemed_cents === 0;

    if (!isZero && !config.overwriteCashback) {
      throw new Error(
        `Cashback existente distinto para ${input.customerPhone}. Usa --overwrite-cashback para reemplazarlo.`,
      );
    }

    stats.cashback.updated += 1;

    if (config.apply) {
      await client.query(
        `update "customer_cashback_account"
         set balance_cents = $1,
             total_earned_cents = $2,
             total_redeemed_cents = $3,
             updated_at = now()
         where customer_id = $4;`,
        [input.balanceCents, input.totalEarnedCents, input.totalRedeemedCents, customer.id],
      );
    }
  }
}

async function writeReport(config: ImportConfig, stats: ImportStats) {
  if (!config.reportDir) {
    return;
  }

  await fs.mkdir(config.reportDir, { recursive: true });
  await fs.writeFile(
    path.join(config.reportDir, "customer-import-summary.json"),
    `${JSON.stringify(
      {
        mode: config.apply ? "apply" : "dry-run",
        generatedAt: new Date().toISOString(),
        stats,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const stats = createEmptyStats();
  const client = await pool.connect();

  try {
    const clientsTable = await loadCsvTable(config.csvDir, "01_clientes.csv");
    const usersTable = config.skipUsers
      ? null
      : await loadCsvTable(config.csvDir, "02_usuarios_clientes.csv");
    const cashbackTable = config.skipCashback
      ? null
      : await loadCsvTable(config.csvDir, "03_cashback_inicial.csv");

    const clients = normalizeClients(clientsTable);
    const clientsByPhone = new Map(clients.map((customer) => [customer.phone, customer]));
    const users = usersTable ? normalizeUsers(usersTable, clientsByPhone) : [];
    const cashback = cashbackTable ? normalizeCashback(cashbackTable, clientsByPhone) : [];

    if (config.apply) {
      await client.query("begin;");
      await client.query("select pg_advisory_xact_lock($1);", [IMPORT_LOCK_KEY]);
    }

    try {
      const importedCustomersByPhone = await importCustomers(client, clients, config, stats);

      if (!config.skipUsers) {
        await importUsers(client, users, importedCustomersByPhone, config, stats);
      }

      if (!config.skipCashback) {
        await importCashback(client, cashback, importedCustomersByPhone, config, stats);
      }

      if (config.apply) {
        await client.query("commit;");
      }
    } catch (error) {
      if (config.apply) {
        await client.query("rollback;");
      }

      throw error;
    }

    await writeReport(config, stats);

    console.log(`[customers:import] Modo: ${config.apply ? "apply" : "dry-run"}`);
    console.log(JSON.stringify(stats, null, 2));
    console.log("[customers:import] Finalizado.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[customers:import] Error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
