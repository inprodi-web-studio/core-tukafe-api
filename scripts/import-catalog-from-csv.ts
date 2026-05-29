import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import pg from "pg";

type CsvRow = Record<string, string> & { __line: number };

interface CsvTable {
  fileName: string;
  filePath: string;
  headers: string[];
  rows: CsvRow[];
}

interface ImportConfig {
  apiUrl: string;
  csvDir: string;
  email: string;
  password: string;
  imagesDir: string | null;
}

interface NamedEntity {
  id: string;
  name: string;
}

interface ProductCategoryNode {
  id: string;
  name: string;
  icon: string;
  color: string;
  isFourPlusOneEligible: boolean;
  image: unknown;
  children: ProductCategoryNode[];
}

interface VariationOption {
  id: string;
  variationGroupId: string;
  name: string;
}

interface VariationGroup {
  id: string;
  name: string;
  customerLabel: string | null;
  options: VariationOption[];
}

interface ModifierOption {
  id: string;
  name: string;
  ingredients: Array<{
    quantity: number;
    ingredient: { id: string; name: string };
  }>;
  supplies: Array<{
    quantity: number;
    supply: { id: string; name: string };
  }>;
}

interface Modifier {
  id: string;
  name: string;
  options: ModifierOption[];
}

interface ProductItem {
  id: string;
  name: string;
}

interface UnitItem {
  id: string;
  name: string;
  abbreviation: string;
  precision: number;
}

interface TaxItem {
  id: string;
  name: string;
  rate: number;
}

interface UploadResponseItem {
  id: string;
  name: string;
}

interface RecipePayload {
  description?: string | null;
  ingredients?: Array<{ ingredientId: string; quantity: number }>;
  supplies?: Array<{ supplyId: string; quantity: number }>;
}

interface VariationPayload {
  price: number;
  kitchenName?: string | null;
  customerDescription?: string | null;
  kitchenDescription?: string | null;
  selections: Array<{ variationGroupId: string; variationOptionId: string }>;
  recipe?: RecipePayload;
}

interface HttpErrorPayload {
  message?: string;
  code?: string;
  statusCode?: number;
  error?: string;
}

class HttpError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

class ApiClient {
  private readonly baseUrl: string;
  private cookieHeader = "";

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async login(email: string, password: string) {
    const { data, headers } = await this.request<{
      user: {
        id: string;
        email: string;
        name: string;
      };
    }>("POST", "/api/admin/auth/login", {
      email,
      password,
    });

    const setCookies = this.extractSetCookies(headers);

    if (setCookies.length === 0) {
      throw new Error(
        "No se recibió cookie de sesión al iniciar sesión. Revisa credenciales y configuración de auth.",
      );
    }

    this.cookieHeader = setCookies.map((value) => value.split(";")[0] ?? value).join("; ");
    return data.user;
  }

  async get<T>(pathname: string, query?: Record<string, string | number | boolean | undefined>) {
    const searchParams = new URLSearchParams();

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined) {
          continue;
        }

        searchParams.set(key, String(value));
      }
    }

    const suffix = searchParams.size > 0 ? `?${searchParams.toString()}` : "";
    const { data } = await this.request<T>("GET", `${pathname}${suffix}`);
    return data;
  }

  async post<T>(pathname: string, body: unknown) {
    const { data } = await this.request<T>("POST", pathname, body, "json");
    return data;
  }

  async postMultipart<T>(pathname: string, formData: FormData) {
    const { data } = await this.request<T>("POST", pathname, formData, "form");
    return data;
  }

  private async request<T>(
    method: string,
    pathname: string,
    body?: unknown,
    bodyType: "json" | "form" = "json",
  ) {
    const headers = new Headers();
    headers.set("accept", "application/json");

    if (this.cookieHeader) {
      headers.set("cookie", this.cookieHeader);
    }

    if (body !== undefined && bodyType === "json") {
      headers.set("content-type", "application/json");
    }

    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${pathname}`, {
        method,
        headers,
        body:
          body === undefined
            ? undefined
            : bodyType === "json"
              ? JSON.stringify(body)
              : (body as FormData),
      });
    } catch (error) {
      throw new Error(
        formatFetchError(`${method} ${this.baseUrl}${pathname}`, error),
        {
          cause: error,
        },
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    const isJson = contentType.toLowerCase().includes("application/json");
    const payload = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      const errorPayload = payload as HttpErrorPayload;
      const message =
        errorPayload?.message ??
        `Request ${method} ${pathname} falló con status ${response.status}.`;
      throw new HttpError(message, response.status, payload);
    }

    return { data: payload as T, headers: response.headers };
  }

  private extractSetCookies(headers: Headers): string[] {
    const anyHeaders = headers as Headers & {
      getSetCookie?: () => string[];
      raw?: () => Record<string, string[]>;
    };

    if (typeof anyHeaders.getSetCookie === "function") {
      return anyHeaders.getSetCookie();
    }

    if (typeof anyHeaders.raw === "function") {
      const raw = anyHeaders.raw();
      const setCookie = raw["set-cookie"];

      if (Array.isArray(setCookie) && setCookie.length > 0) {
        return setCookie;
      }
    }

    const single = headers.get("set-cookie");
    return single ? [single] : [];
  }
}

function formatFetchError(operation: string, error: unknown) {
  const base = error instanceof Error ? error.message : String(error);
  const anyError = error as Error & {
    cause?: {
      code?: string;
      errno?: number;
      address?: string;
      port?: number;
      message?: string;
    };
  };
  const cause = anyError.cause;

  if (!cause) {
    return `No se pudo conectar al API durante ${operation}: ${base}`;
  }

  const code = cause.code ? ` code=${cause.code}` : "";
  const address = cause.address ? ` address=${cause.address}` : "";
  const port = cause.port ? ` port=${cause.port}` : "";
  const message = cause.message ? ` cause="${cause.message}"` : "";

  return [
    `No se pudo conectar al API durante ${operation}.`,
    `${base}${code}${address}${port}${message}`.trim(),
    "Verifica que el servidor esté corriendo y que --api-url apunte al puerto correcto.",
  ].join(" ");
}

const ORDERED_FILES = [
  "01_categorias_producto.csv",
  "02_productos.csv",
  "03_categorias_ingrediente.csv",
  "04_ingredientes.csv",
  "05_categorias_insumo.csv",
  "06_insumos.csv",
  "07_grupos_variacion.csv",
  "08_opciones_grupo_variacion.csv",
  "09_producto_grupos_variacion.csv",
  "10_variaciones_producto.csv",
  "11_selecciones_variacion_producto.csv",
  "12_recetas_producto.csv",
  "13_modificadores.csv",
  "14_opciones_modificador.csv",
  "15_componentes_opcion_modificador.csv",
  "16_producto_modificadores.csv",
] as const;

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
  const repaired = tryRepairLatin1Mojibake(base);
  return repairKnownArtifacts(repaired);
}

function toNullable(value: string | null | undefined) {
  const normalized = cleanText(value);
  return normalized.length > 0 ? normalized : null;
}

function canonicalize(value: string) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

const NANOID_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-";
const NANOID_LENGTH = 21;
const NANOID_REGEX = /^[a-zA-Z0-9_-]{21}$/;

function createNanoId() {
  const bytes = randomBytes(NANOID_LENGTH);
  let result = "";

  for (const byte of bytes) {
    result += NANOID_ALPHABET[byte % NANOID_ALPHABET.length] ?? "a";
  }

  return result;
}

function isNanoId(value: string) {
  return NANOID_REGEX.test(value);
}

function levenshtein(left: string, right: string) {
  if (left === right) {
    return 0;
  }

  if (left.length === 0) {
    return right.length;
  }

  if (right.length === 0) {
    return left.length;
  }

  const prev = new Array(right.length + 1).fill(0);
  const curr = new Array(right.length + 1).fill(0);

  for (let j = 0; j <= right.length; j += 1) {
    prev[j] = j;
  }

  for (let i = 1; i <= left.length; i += 1) {
    curr[0] = i;

    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;

      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
    }

    for (let j = 0; j <= right.length; j += 1) {
      prev[j] = curr[j];
    }
  }

  return prev[right.length];
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

    const record: CsvRow = { __line: index + 1 };

    for (let col = 0; col < headers.length; col += 1) {
      const header = headers[col] ?? `col_${col + 1}`;
      const value = raw[col] ?? "";
      record[header] = cleanText(value);
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

async function loadCsvTable(csvDir: string, fileName: string): Promise<CsvTable> {
  const filePath = path.join(csvDir, fileName);
  const raw = await fs.readFile(filePath);
  const content = decodeCsvBuffer(raw);
  const parsed = parseCsv(content);

  return {
    fileName,
    filePath,
    headers: parsed.headers,
    rows: parsed.records,
  };
}

function getCell(table: CsvTable, row: CsvRow, key: string, { required = false } = {}) {
  if (!(key in row)) {
    throw new Error(`Falta la columna "${key}" en ${table.fileName}.`);
  }

  const value = cleanText(row[key]);

  if (required && value.length === 0) {
    throw new Error(
      `Campo requerido vacío: ${table.fileName}:${row.__line} columna "${key}".`,
    );
  }

  return value;
}

function parseNumber(table: CsvTable, row: CsvRow, key: string, { required = false } = {}) {
  const raw = getCell(table, row, key, { required });

  if (raw.length === 0) {
    return undefined;
  }

  const normalized = raw.replace(/\$/g, "");
  const value = Number(normalized);

  if (!Number.isFinite(value)) {
    throw new Error(
      `Número inválido en ${table.fileName}:${row.__line} columna "${key}" => "${raw}".`,
    );
  }

  return value;
}

function parseYesNo(table: CsvTable, row: CsvRow, key: string, fallback = false) {
  const raw = getCell(table, row, key);

  if (raw.length === 0) {
    return fallback;
  }

  const value = raw.toLowerCase();

  if (value === "si" || value === "sí" || value === "true" || value === "1") {
    return true;
  }

  if (value === "no" || value === "false" || value === "0") {
    return false;
  }

  throw new Error(
    `Valor booleano inválido en ${table.fileName}:${row.__line} columna "${key}" => "${raw}". Usa SI/NO.`,
  );
}

function normalizeListCandidate(values: string[]) {
  return [...new Set(values.map((value) => cleanText(value)).filter(Boolean))];
}

function resolveSingle(
  source: string,
  candidates: string[],
  label: string,
  context: string,
  maxDistance = 2,
) {
  const normalizedSource = cleanText(source);
  const normalizedCandidates = normalizeListCandidate(candidates);

  if (normalizedSource.length === 0) {
    throw new Error(`Referencia vacía para ${label} en ${context}.`);
  }

  const exact = normalizedCandidates.find(
    (candidate) => candidate.toLowerCase() === normalizedSource.toLowerCase(),
  );

  if (exact) {
    return exact;
  }

  const sourceCanonical = canonicalize(normalizedSource);
  const canonicalMatches = normalizedCandidates.filter(
    (candidate) => canonicalize(candidate) === sourceCanonical,
  );

  if (canonicalMatches.length === 1) {
    return canonicalMatches[0] ?? normalizedSource;
  }

  if (canonicalMatches.length > 1) {
    throw new Error(
      `Referencia ambigua para ${label} "${source}" en ${context}. Coincidencias: ${canonicalMatches.join(", ")}`,
    );
  }

  const scored = normalizedCandidates
    .map((candidate) => ({
      candidate,
      distance: levenshtein(sourceCanonical, canonicalize(candidate)),
    }))
    .sort((left, right) => left.distance - right.distance);

  const best = scored[0];
  const second = scored[1];

  if (
    best &&
    best.distance <= maxDistance &&
    (!second || second.distance > best.distance)
  ) {
    return best.candidate;
  }

  const includeMatches = normalizedCandidates.filter((candidate) => {
    const candidateCanonical = canonicalize(candidate);
    return (
      candidateCanonical.includes(sourceCanonical) ||
      sourceCanonical.includes(candidateCanonical)
    );
  });

  if (includeMatches.length === 1) {
    return includeMatches[0] ?? normalizedSource;
  }

  const topSuggestions = scored.slice(0, 3).map((entry) => entry.candidate);
  throw new Error(
    `No se pudo resolver ${label} "${source}" en ${context}. Sugerencias: ${topSuggestions.join(", ")}`,
  );
}

function resolveManyByPrefixLike(source: string, candidates: string[]) {
  const sourceCanonical = canonicalize(source);

  if (sourceCanonical.length === 0) {
    return [] as string[];
  }

  const normalizedCandidates = normalizeListCandidate(candidates);
  const matches = normalizedCandidates.filter((candidate) => {
    const candidateCanonical = canonicalize(candidate);

    if (
      candidateCanonical.includes(sourceCanonical) ||
      sourceCanonical.includes(candidateCanonical)
    ) {
      return true;
    }

    const prefixCandidate = candidateCanonical.slice(0, sourceCanonical.length);
    if (prefixCandidate.length === 0) {
      return false;
    }

    return levenshtein(prefixCandidate, sourceCanonical) <= 1;
  });

  return [...new Set(matches)];
}

const UNIT_ALIAS_GROUPS = [
  ["pza", "pz", "pieza", "piezas", "unidad", "unidades", "u"],
  ["ml", "mililitro", "mililitros"],
  ["l", "lt", "litro", "litros"],
  ["g", "gr", "gramo", "gramos"],
  ["kg", "kilo", "kilos", "kilogramo", "kilogramos"],
];

function resolveUnitAliasGroup(input: string) {
  const key = canonicalize(input);
  const matched = UNIT_ALIAS_GROUPS.find((group) => group.includes(key));
  return matched ?? [key];
}

function findUnit(units: UnitItem[], unitValue: string) {
  const canonicalInput = canonicalize(unitValue);

  const exact = units.find(
    (unit) =>
      canonicalize(unit.name) === canonicalInput ||
      canonicalize(unit.abbreviation) === canonicalInput,
  );

  if (exact) {
    return exact;
  }

  const aliasGroup = resolveUnitAliasGroup(unitValue);
  const aliasMatched = units.find((unit) => {
    const nameKey = canonicalize(unit.name);
    const abbreviationKey = canonicalize(unit.abbreviation);
    return aliasGroup.includes(nameKey) || aliasGroup.includes(abbreviationKey);
  });

  if (aliasMatched) {
    return aliasMatched;
  }

  const scored = units
    .map((unit) => ({
      unit,
      distance: Math.min(
        levenshtein(canonicalInput, canonicalize(unit.name)),
        levenshtein(canonicalInput, canonicalize(unit.abbreviation)),
      ),
    }))
    .sort((left, right) => left.distance - right.distance);

  const best = scored[0];
  const second = scored[1];

  if (
    best &&
    best.distance <= 1 &&
    (!second || second.distance > best.distance)
  ) {
    return best.unit;
  }

  return null;
}

function inferUnitPayload(unitValue: string) {
  const value = cleanText(unitValue);
  const key = canonicalize(value);

  if (["pza", "pz", "pieza", "piezas", "unidad", "unidades", "u"].includes(key)) {
    return { name: "Pieza", abbreviation: "pza", precision: 0 };
  }

  if (["ml", "mililitro", "mililitros"].includes(key)) {
    return { name: "Mililitro", abbreviation: "ml", precision: 2 };
  }

  if (["l", "lt", "litro", "litros"].includes(key)) {
    return { name: "Litro", abbreviation: "l", precision: 2 };
  }

  if (["g", "gr", "gramo", "gramos"].includes(key)) {
    return { name: "Gramo", abbreviation: "g", precision: 2 };
  }

  if (["kg", "kilo", "kilos", "kilogramo", "kilogramos"].includes(key)) {
    return { name: "Kilogramo", abbreviation: "kg", precision: 3 };
  }

  return {
    name: value,
    abbreviation: value.toLowerCase(),
    precision: 2,
  };
}

async function fetchPaginated<T>(
  api: ApiClient,
  pathname: string,
): Promise<T[]> {
  const items: T[] = [];
  let page = 1;
  const pageSize = 100;

  while (true) {
    const response = await api.get<{
      data: T[];
      pagination: {
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
      };
    }>(pathname, { page, pageSize });

    items.push(...response.data);

    if (!response.pagination || page >= response.pagination.totalPages) {
      break;
    }

    page += 1;
  }

  return items;
}

function flattenProductCategories(
  nodes: ProductCategoryNode[],
  parentPath = "",
  parentId: string | null = null,
) {
  const rows: Array<{
    id: string;
    name: string;
    path: string;
    parentId: string | null;
  }> = [];

  for (const node of nodes) {
    const currentPath = parentPath ? `${parentPath} > ${node.name}` : node.name;
    rows.push({
      id: node.id,
      name: node.name,
      path: currentPath,
      parentId,
    });

    rows.push(...flattenProductCategories(node.children ?? [], currentPath, node.id));
  }

  return rows;
}

function resolveCategoryIdByPath(
  inputPath: string,
  categoryTree: ProductCategoryNode[],
  context: string,
) {
  const normalizedPath = cleanText(inputPath);

  if (normalizedPath.length === 0) {
    return null;
  }

  const flat = flattenProductCategories(categoryTree);
  const exactPath = flat.find(
    (row) => cleanText(row.path).toLowerCase() === normalizedPath.toLowerCase(),
  );

  if (exactPath) {
    return exactPath.id;
  }

  const parts = normalizedPath
    .split(">")
    .map((value) => cleanText(value))
    .filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  let currentNodes = categoryTree;
  let selectedNode: ProductCategoryNode | null = null;

  for (const part of parts) {
    const resolvedName = resolveSingle(
      part,
      currentNodes.map((node) => node.name),
      "categoría de producto",
      context,
      2,
    );

    selectedNode =
      currentNodes.find((node) => node.name === resolvedName) ?? null;

    if (!selectedNode) {
      throw new Error(
        `No se encontró categoría "${part}" en la ruta "${inputPath}" (${context}).`,
      );
    }

    currentNodes = selectedNode.children ?? [];
  }

  return selectedNode?.id ?? null;
}

function getOptionalCell(row: CsvRow, key: string) {
  if (!(key in row)) {
    return "";
  }

  return cleanText(row[key]);
}

const IMAGE_EXTENSION_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
};

function getImageMimeType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  return IMAGE_EXTENSION_TO_MIME[extension] ?? null;
}

function isSupportedImageFile(filePath: string) {
  return getImageMimeType(filePath) !== null;
}

async function fileExists(filePath: string) {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

async function listImageFiles(imagesDir: string) {
  const found: string[] = [];

  async function walk(currentPath: string): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (entry.isFile() && isSupportedImageFile(fullPath)) {
        found.push(fullPath);
      }
    }
  }

  await walk(imagesDir);
  return found;
}

function buildImageIndex(imagePaths: string[]) {
  const byCanonicalStem = new Map<string, string[]>();

  for (const imagePath of imagePaths) {
    const stem = path.parse(imagePath).name;
    const key = canonicalize(stem);
    const current = byCanonicalStem.get(key) ?? [];
    current.push(imagePath);
    byCanonicalStem.set(key, current);
  }

  return byCanonicalStem;
}

async function resolveImagePathForEntity({
  entityName,
  entityLabel,
  imageHint,
  imagesDir,
  csvDir,
  imageIndex,
  context,
}: {
  entityName: string;
  entityLabel: string;
  imageHint: string;
  imagesDir: string | null;
  csvDir: string;
  imageIndex: Map<string, string[]>;
  context: string;
}) {
  const normalizedHint = cleanText(imageHint);

  if (normalizedHint.length > 0) {
    const candidatePaths: string[] = [];

    if (path.isAbsolute(normalizedHint)) {
      candidatePaths.push(normalizedHint);
    } else {
      if (imagesDir) {
        candidatePaths.push(path.join(imagesDir, normalizedHint));
      }
      candidatePaths.push(path.join(csvDir, normalizedHint));
      candidatePaths.push(path.resolve(process.cwd(), normalizedHint));
    }

    const expandedCandidates: string[] = [];
    for (const candidatePath of candidatePaths) {
      expandedCandidates.push(candidatePath);

      if (path.extname(candidatePath).length === 0) {
        for (const extension of Object.keys(IMAGE_EXTENSION_TO_MIME)) {
          expandedCandidates.push(`${candidatePath}${extension}`);
        }
      }
    }

    const dedupedCandidates = [...new Set(expandedCandidates)];

    for (const candidatePath of dedupedCandidates) {
      if (await fileExists(candidatePath)) {
        if (!isSupportedImageFile(candidatePath)) {
          throw new Error(
            `La imagen "${candidatePath}" no tiene extensión soportada (${context}). Usa jpg, jpeg, png, webp, avif o gif.`,
          );
        }

        return candidatePath;
      }
    }

    if (imagesDir) {
      const hintMatches = imageIndex.get(canonicalize(normalizedHint)) ?? [];

      if (hintMatches.length === 1) {
        return hintMatches[0] ?? null;
      }

      if (hintMatches.length > 1) {
        throw new Error(
          `Coincidencia ambigua de imagen "${normalizedHint}" para ${entityLabel} "${entityName}" (${context}): ${hintMatches.join(", ")}`,
        );
      }
    }

    throw new Error(
      `No se encontró archivo de imagen "${normalizedHint}" para ${entityLabel} "${entityName}" (${context}).`,
    );
  }

  if (!imagesDir) {
    return null;
  }

  const matches = imageIndex.get(canonicalize(entityName)) ?? [];

  if (matches.length > 1) {
    throw new Error(
      `Coincidencia ambigua de imagen para ${entityLabel} "${entityName}" (${context}): ${matches.join(", ")}`,
    );
  }

  return matches[0] ?? null;
}

async function uploadImageAsset({
  api,
  imagePath,
  cache,
}: {
  api: ApiClient;
  imagePath: string;
  cache: Map<string, string>;
}) {
  const absolutePath = path.resolve(imagePath);
  const cachedUploadId = cache.get(absolutePath);

  if (cachedUploadId) {
    return cachedUploadId;
  }

  const fileBuffer = await fs.readFile(absolutePath);
  if (fileBuffer.length === 0) {
    throw new Error(`La imagen "${absolutePath}" está vacía.`);
  }

  const mimeType = getImageMimeType(absolutePath) ?? "application/octet-stream";
  const fileName = path.basename(absolutePath);

  const form = new FormData();
  form.set("visibility", "PUBLIC");
  form.set("optimizeImage", "true");
  form.set("optimizationQuality", "85");
  form.set("maxWidth", "1600");
  form.set("maxHeight", "1600");
  form.append("file", new Blob([fileBuffer], { type: mimeType }), fileName);

  const response = await api.postMultipart<{ data: UploadResponseItem[] }>("/api/admin/uploads", form);
  const uploadId = response.data[0]?.id;

  if (!uploadId) {
    throw new Error(`No se recibió upload id para la imagen "${absolutePath}".`);
  }

  cache.set(absolutePath, uploadId);
  return uploadId;
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
    printHelp();
    process.exit(0);
  }

  return {
    apiUrl:
      options.get("api-url") ??
      process.env.API_URL ??
      process.env.PUBLIC_URL ??
      "http://localhost:3000",
    csvDir:
      options.get("csv-dir") ??
      path.resolve(process.cwd(), "templates/importacion-catalogo"),
    email:
      options.get("email") ??
      process.env.CATALOG_IMPORT_ADMIN_EMAIL ??
      "amurillo@inprodi.com.mx",
    password:
      options.get("password") ??
      process.env.CATALOG_IMPORT_ADMIN_PASSWORD ??
      "Asdf123456",
    imagesDir:
      options.get("images-dir") ??
      process.env.CATALOG_IMPORT_IMAGES_DIR ??
      "",
  };
}

function printHelp() {
  console.log(`
Uso:
  node --env-file=.env --import tsx scripts/import-catalog-from-csv.ts [opciones]

Opciones:
  --api-url <url>             Base URL del API (default: API_URL/PUBLIC_URL o http://localhost:3000)
  --csv-dir <ruta>            Carpeta de CSV (default: templates/importacion-catalogo)
  --email <correo>            Usuario admin para login
  --password <password>       Password admin para login
  --images-dir <ruta>         Carpeta de imágenes de categorías/productos (opcional)
  --help                      Mostrar ayuda
`.trim());
}

function extractPortFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.port) {
      return Number(parsed.port);
    }

    if (parsed.protocol === "https:") {
      return 443;
    }

    if (parsed.protocol === "http:") {
      return 80;
    }

    return null;
  } catch {
    return null;
  }
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

async function withDbClient<T>(executor: (client: pg.Client) => Promise<T>) {
  const client = createDbClient();

  try {
    await client.connect();
    return await executor(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function ensurePopupOrganization(ownerUserId: string) {
  return withDbClient(async (client) => {
    const activeOrganizationsResult = await client.query<{
      id: string;
      name: string;
      slug: string;
      deleted_at: string | null;
    }>(
      `select id, name, slug, deleted_at
       from "organization"
       where deleted_at is null
       order by created_at asc;`,
    );

    const organizations = activeOrganizationsResult.rows;
    const allSlugRows = await client.query<{ slug: string }>(
      `select slug from "organization" where slug is not null;`,
    );
    const byName = organizations.find(
      (organization) => canonicalize(organization.name) === canonicalize("Pop Up"),
    );
    const bySlug = organizations.find(
      (organization) => canonicalize(organization.slug) === canonicalize("pop-up"),
    );
    const existing = byName ?? bySlug ?? null;

    const existingIds = new Set(organizations.map((organization) => organization.id));
    const existingSlugs = new Set(
      allSlugRows.rows.map((row) => cleanText(row.slug).toLowerCase()),
    );

    let popupId = existing?.id ?? "";
    let popupCreated = false;
    let popupSlug = existing?.slug ?? "";

    // Product create schema currently requires nanoid organization IDs.
    if (!existing || !isNanoId(existing.id)) {
      if (existing && !isNanoId(existing.id)) {
        console.warn(
          `ADVERTENCIA: organización "Pop Up" existente tiene ID no-nanoid (${existing.id}). Se creará una nueva organización compatible para el importador.`,
        );
      }

      do {
        popupId = createNanoId();
      } while (existingIds.has(popupId));

      let slugIndex = 1;
      popupSlug = "pop-up";
      while (existingSlugs.has(popupSlug)) {
        slugIndex += 1;
        popupSlug = `pop-up-${slugIndex}`;
      }

      await client.query(
        `insert into "organization" (id, name, slug, address, created_at, updated_at)
         values ($1, $2, $3, $4, now(), now());`,
        [
          popupId,
          "Pop Up",
          popupSlug,
          "Sin direccion fisica (sucursal temporal).",
        ],
      );

      popupCreated = true;
    }

    const memberResult = await client.query<{ id: string }>(
      `select id from "member"
       where user_id = $1 and organization_id = $2
       limit 1;`,
      [ownerUserId, popupId],
    );

    if (!memberResult.rows[0]) {
      let memberId = createNanoId();
      // Keep generating until we find a free member ID.
      // Collision risk is extremely low, this loop is a safety net.
      while (
        (
          await client.query<{ id: string }>(`select id from "member" where id = $1 limit 1;`, [
            memberId,
          ])
        ).rows.length > 0
      ) {
        memberId = createNanoId();
      }

      await client.query(
        `insert into "member" (id, user_id, organization_id, role, created_at, updated_at)
         values ($1, $2, $3, 'owner', now(), now());`,
        [memberId, ownerUserId, popupId],
      );
    }

    return {
      id: popupId,
      created: popupCreated,
      slug: popupSlug || existing?.slug || "pop-up",
    };
  });
}

async function ensureIvaTax(api: ApiClient) {
  try {
    const taxes = await fetchPaginated<TaxItem>(api, "/api/admin/taxes");
    const existingIva = taxes.find((tax) => canonicalize(tax.name) === canonicalize("IVA"));
    if (existingIva) {
      return { id: existingIva.id, created: false };
    }

    const containedIva = taxes.find((tax) => canonicalize(tax.name).includes("iva"));
    if (containedIva) {
      return { id: containedIva.id, created: false };
    }

    const created = await ensureCreate(
      () =>
        api.post<TaxItem>("/api/admin/taxes", {
          name: "IVA",
          rate: 16,
        }),
      async () => {
        const refreshedTaxes = await fetchPaginated<TaxItem>(api, "/api/admin/taxes");
        const resolved = refreshedTaxes.find(
          (tax) => canonicalize(tax.name) === canonicalize("IVA"),
        );
        if (!resolved) {
          throw new Error("No se pudo recuperar el impuesto IVA después de conflicto.");
        }

        return resolved;
      },
    );
    return { id: created.id, created: true };
  } catch (error) {
    throw new Error(
      `No se pudo asegurar el impuesto IVA: ${error instanceof Error ? error.message : String(error)}`,
      {
        cause: error,
      },
    );
  }
}

async function loadExistingProductsFromDb() {
  return withDbClient(async (client) => {
    const result = await client.query<{
      id: string;
      name: string;
    }>(
      `select id, name
       from "product"
       where deleted_at is null
       order by created_at asc;`,
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: cleanText(row.name),
    }));
  });
}

function buildProductReferenceResolver(productRows: CsvRow[], table: CsvTable) {
  const names = productRows.map((row) => getCell(table, row, "nombre_producto", { required: true }));

  return {
    names,
    resolveOne(input: string, context: string) {
      return resolveSingle(input, names, "producto", context, 3);
    },
    resolveManyForModifier(input: string, context: string) {
      try {
        return [resolveSingle(input, names, "producto", context, 3)];
      } catch {
        const many = resolveManyByPrefixLike(input, names);

        if (many.length === 0) {
          throw new Error(
            `No se pudo resolver el producto "${input}" para modificadores en ${context}.`,
          );
        }

        return many;
      }
    },
  };
}

function mapByName<T extends NamedEntity>(rows: T[]) {
  return new Map(rows.map((row) => [row.name, row]));
}

function buildCategoryKey(name: string, parentId: string | null) {
  return `${canonicalize(name)}::${parentId ?? "__root__"}`;
}

function findByName<T extends NamedEntity>(
  target: string,
  rows: T[],
  label: string,
  context: string,
) {
  const resolvedName = resolveSingle(
    target,
    rows.map((row) => row.name),
    label,
    context,
    3,
  );

  const row = rows.find((item) => item.name === resolvedName);

  if (!row) {
    throw new Error(`No se encontró ${label} "${target}" en ${context}.`);
  }

  return row;
}

async function ensureCreate<T>(
  createFn: () => Promise<T>,
  onConflict: () => Promise<T>,
) {
  try {
    return await createFn();
  } catch (error) {
    if (error instanceof HttpError && error.status === 409) {
      return onConflict();
    }

    throw error;
  }
}

async function main() {
  const parsed = parseArgs();

  const config: ImportConfig = {
    apiUrl: parsed.apiUrl,
    csvDir: parsed.csvDir,
    email: parsed.email,
    password: parsed.password,
    imagesDir: cleanText(parsed.imagesDir).length > 0 ? path.resolve(parsed.imagesDir) : null,
  };

  if (!config.imagesDir) {
    const implicitImagesDir = path.resolve(process.cwd(), "templates/imagenes-productos");
    try {
      const stats = await fs.stat(implicitImagesDir);
      if (stats.isDirectory()) {
        config.imagesDir = implicitImagesDir;
      }
    } catch {
      // no-op: keep images disabled unless explicitly configured
    }
  }

  console.log("==========================================");
  console.log("Importador de catálogo TuKafe");
  console.log("==========================================");
  console.log(`API URL: ${config.apiUrl}`);
  console.log(`CSV DIR: ${config.csvDir}`);
  console.log(`IMAGES DIR: ${config.imagesDir ?? "(no configurado)"}`);
  console.log(`Admin: ${config.email}`);
  console.log(`Org objetivo: Pop Up`);
  console.log(`Tax obligatorio: IVA`);
  console.log("------------------------------------------");

  const envPort = Number(cleanText(process.env.PORT));
  const apiPort = extractPortFromUrl(config.apiUrl);

  if (Number.isFinite(envPort) && apiPort && envPort !== apiPort) {
    console.warn(
      `ADVERTENCIA: PORT=${envPort} pero API_URL usa puerto ${apiPort}. Revisa que apunten al mismo servidor.`,
    );
  }

  const csvTables = await Promise.all(
    ORDERED_FILES.map((fileName) => loadCsvTable(config.csvDir, fileName)),
  );

  const tableByName = new Map(csvTables.map((table) => [table.fileName, table]));
  const table = (fileName: (typeof ORDERED_FILES)[number]) => {
    const found = tableByName.get(fileName);
    if (!found) {
      throw new Error(`No se encontró la tabla ${fileName}.`);
    }
    return found;
  };

  const uploadedImageIdByPath = new Map<string, string>();
  let imageIndex = new Map<string, string[]>();

  if (config.imagesDir) {
    try {
      const stats = await fs.stat(config.imagesDir);
      if (!stats.isDirectory()) {
        throw new Error();
      }
    } catch {
      throw new Error(`La carpeta de imágenes no existe o no es válida: ${config.imagesDir}`);
    }

    const imageFiles = await listImageFiles(config.imagesDir);
    imageIndex = buildImageIndex(imageFiles);
    console.log(`Imágenes detectadas: ${imageFiles.length}`);
  }

  const api = new ApiClient(config.apiUrl);
  await api.get<{ status: string }>("/health");
  const user = await api.login(config.email, config.password);
  console.log(`Sesión iniciada con: ${user.email}`);

  const popupOrganization = await ensurePopupOrganization(user.id);
  console.log(
    popupOrganization.created
      ? `Organización creada: Pop Up (${popupOrganization.id})`
      : `Organización encontrada: Pop Up (${popupOrganization.id})`,
  );

  const ivaTax = await ensureIvaTax(api);
  console.log(
    ivaTax.created
      ? `Impuesto creado: IVA (${ivaTax.id})`
      : `Impuesto encontrado: IVA (${ivaTax.id})`,
  );

  const organizationIds = [popupOrganization.id];

  // 1) Product categories
  console.log("1/16 Importando categorías de producto...");
  const productCategoriesTable = table("01_categorias_producto.csv");
  let productCategoryTree = await api.get<{
    data: ProductCategoryNode[];
  }>("/api/admin/products/categories");
  const productCategoryNameToId = new Map<string, string>();
  const existingCategoryKeys = new Set<string>();
  for (const item of flattenProductCategories(productCategoryTree.data)) {
    productCategoryNameToId.set(item.name, item.id);
    existingCategoryKeys.add(buildCategoryKey(item.name, item.parentId));
  }

  const pendingProductCategories = [...productCategoriesTable.rows];
  let loopGuard = 0;

  while (pendingProductCategories.length > 0) {
    if (loopGuard > 1000) {
      throw new Error(
        "Se alcanzó el máximo de iteraciones al resolver jerarquía de categorías de producto.",
      );
    }

    loopGuard += 1;
    let progressed = false;

    for (let index = pendingProductCategories.length - 1; index >= 0; index -= 1) {
      const row = pendingProductCategories[index];
      if (!row) {
        continue;
      }

      const name = getCell(productCategoriesTable, row, "nombre_categoria", { required: true });
      const imageHint = getOptionalCell(row, "archivo_imagen");
      const imagePath = await resolveImagePathForEntity({
        entityName: name,
        entityLabel: "categoría",
        imageHint,
        imagesDir: config.imagesDir,
        csvDir: config.csvDir,
        imageIndex,
        context: `${productCategoriesTable.fileName}:${row.__line}`,
      });
      const parentNameRaw = getCell(productCategoriesTable, row, "categoria_padre");
      const icon = getCell(productCategoriesTable, row, "icono", { required: true });
      const color = getCell(productCategoriesTable, row, "color_hex", { required: true });
      const isFourPlusOneEligible = parseYesNo(
        productCategoriesTable,
        row,
        "aplica_4_mas_1",
        false,
      );

      let parentId: string | null = null;

      if (parentNameRaw.length > 0) {
        const parentResolved = resolveSingle(
          parentNameRaw,
          [...productCategoryNameToId.keys()],
          "categoría padre",
          `${productCategoriesTable.fileName}:${row.__line}`,
          3,
        );
        parentId = productCategoryNameToId.get(parentResolved) ?? null;

        if (!parentId) {
          continue;
        }
      }

      const categoryKey = buildCategoryKey(name, parentId);
      if (existingCategoryKeys.has(categoryKey)) {
        if (imagePath) {
          console.log(
            `  - Imagen omitida para categoría "${name}" porque ya existe y no se actualiza en importación.`,
          );
        }
        pendingProductCategories.splice(index, 1);
        progressed = true;
        continue;
      }

      const imageUploadId = imagePath
        ? await uploadImageAsset({
            api,
            imagePath,
            cache: uploadedImageIdByPath,
          })
        : null;

      const created = await ensureCreate(
        () =>
          api.post<{
            id: string;
            name: string;
          }>("/api/admin/products/categories", {
            name,
            icon,
            color,
            isFourPlusOneEligible,
            parentId,
            imageUploadId,
          }),
        async () => {
          const latest = await api.get<{
            data: ProductCategoryNode[];
          }>("/api/admin/products/categories");
          const flat = flattenProductCategories(latest.data);

          const sameName = flat.filter(
            (item) =>
              canonicalize(item.name) === canonicalize(name) &&
              ((parentId === null && item.parentId === null) || item.parentId === parentId),
          );

          if (sameName.length === 1) {
            const entry = sameName[0];
            if (!entry) {
              throw new Error(
                `No se pudo recuperar categoría existente "${name}" después de conflicto.`,
              );
            }

            return { id: entry.id, name: entry.name };
          }

          throw new Error(
            `Conflicto creando categoría "${name}" y no se pudo identificar el registro existente.`,
          );
        },
      );

      productCategoryNameToId.set(created.name, created.id);
      existingCategoryKeys.add(categoryKey);
      if (imagePath && imageUploadId) {
        console.log(`  + Imagen asignada a categoría "${created.name}" (${path.basename(imagePath)}).`);
      }
      pendingProductCategories.splice(index, 1);
      progressed = true;
    }

    if (!progressed) {
      const unresolved = pendingProductCategories
        .map((row) => getCell(productCategoriesTable, row, "nombre_categoria"))
        .join(", ");
      throw new Error(
        `No fue posible resolver categorías con padre pendiente: ${unresolved}`,
      );
    }
  }

  productCategoryTree = await api.get<{ data: ProductCategoryNode[] }>(
    "/api/admin/products/categories",
  );
  const flatProductCategories = flattenProductCategories(productCategoryTree.data);
  console.log(
    `  OK categorías producto: ${flatProductCategories.length} disponibles.`,
  );

  // 2) Ingredient categories
  console.log("2/16 Importando categorías de ingredientes...");
  const ingredientCategoriesTable = table("03_categorias_ingrediente.csv");
  let ingredientCategories = await fetchPaginated<NamedEntity>(
    api,
    "/api/admin/ingredients/categories",
  );

  for (const row of ingredientCategoriesTable.rows) {
    const name = getCell(ingredientCategoriesTable, row, "nombre_categoria", { required: true });
    const icon = getCell(ingredientCategoriesTable, row, "icono", { required: true });
    const color = getCell(ingredientCategoriesTable, row, "color_hex", { required: true });

    const exists = ingredientCategories.find(
      (item) => canonicalize(item.name) === canonicalize(name),
    );

    if (exists) {
      continue;
    }

    const created = await ensureCreate(
      () =>
        api.post<NamedEntity>("/api/admin/ingredients/categories", {
          name,
          icon,
          color,
        }),
      async () => findByName(name, ingredientCategories, "categoría de ingrediente", "conflicto"),
    );

    ingredientCategories.push(created);
  }

  ingredientCategories = await fetchPaginated<NamedEntity>(
    api,
    "/api/admin/ingredients/categories",
  );
  console.log(`  OK categorías ingrediente: ${ingredientCategories.length}.`);

  // 3) Supply categories
  console.log("3/16 Importando categorías de insumos...");
  const supplyCategoriesTable = table("05_categorias_insumo.csv");
  let supplyCategories = await fetchPaginated<NamedEntity>(
    api,
    "/api/admin/supplies/categories",
  );

  for (const row of supplyCategoriesTable.rows) {
    const name = getCell(supplyCategoriesTable, row, "nombre_categoria", { required: true });
    const icon = getCell(supplyCategoriesTable, row, "icono", { required: true });
    const color = getCell(supplyCategoriesTable, row, "color_hex", { required: true });

    const exists = supplyCategories.find(
      (item) => canonicalize(item.name) === canonicalize(name),
    );
    if (exists) {
      continue;
    }

    const created = await ensureCreate(
      () =>
        api.post<NamedEntity>("/api/admin/supplies/categories", {
          name,
          icon,
          color,
        }),
      async () => findByName(name, supplyCategories, "categoría de insumo", "conflicto"),
    );

    supplyCategories.push(created);
  }

  supplyCategories = await fetchPaginated<NamedEntity>(
    api,
    "/api/admin/supplies/categories",
  );
  console.log(`  OK categorías insumo: ${supplyCategories.length}.`);

  // 4) Ingredients
  console.log("4/16 Importando ingredientes...");
  let units = await fetchPaginated<UnitItem>(api, "/api/admin/units");
  const ensureUnit = async (unitValue: string, context: string) => {
    const existingUnit = findUnit(units, unitValue);

    if (existingUnit) {
      return existingUnit;
    }

    const payload = inferUnitPayload(unitValue);
    const createdUnit = await ensureCreate(
      () => api.post<UnitItem>("/api/admin/units", payload),
      async () => {
        units = await fetchPaginated<UnitItem>(api, "/api/admin/units");
        const resolved = findUnit(units, unitValue) ?? findUnit(units, payload.abbreviation);

        if (!resolved) {
          throw new Error(
            `No se pudo recuperar la unidad "${unitValue}" después de conflicto (${context}).`,
          );
        }

        return resolved;
      },
    );

    if (!units.some((unit) => unit.id === createdUnit.id)) {
      units.push(createdUnit);
    }

    console.log(
      `  + Unidad creada automáticamente: ${createdUnit.name} (${createdUnit.abbreviation}, precisión ${createdUnit.precision})`,
    );

    return createdUnit;
  };
  const ingredientsTable = table("04_ingredientes.csv");

  let ingredients = await fetchPaginated<{
    id: string;
    name: string;
  }>(api, "/api/admin/ingredients");

  for (const row of ingredientsTable.rows) {
    const name = getCell(ingredientsTable, row, "nombre_ingrediente", { required: true });
    const categoryName = getCell(ingredientsTable, row, "categoria_ingrediente", { required: true });
    const unitValue = getCell(ingredientsTable, row, "unidad_base", { required: true });
    const baseCostPerUnit = parseNumber(ingredientsTable, row, "costo_por_unidad", {
      required: true,
    });
    const description = toNullable(getCell(ingredientsTable, row, "descripcion"));

    const exists = ingredients.find(
      (item) => canonicalize(item.name) === canonicalize(name),
    );
    if (exists) {
      continue;
    }

    const category = findByName(
      categoryName,
      ingredientCategories,
      "categoría de ingrediente",
      `${ingredientsTable.fileName}:${row.__line}`,
    );
    const unit = await ensureUnit(
      unitValue,
      `${ingredientsTable.fileName}:${row.__line}`,
    );

    const created = await ensureCreate(
      () =>
        api.post<{
          id: string;
          name: string;
        }>("/api/admin/ingredients", {
          name,
          description,
          baseUnitId: unit.id,
          categoryId: category.id,
          baseCostPerUnit,
        }),
      async () => findByName(name, ingredients, "ingrediente", "conflicto"),
    );
    ingredients.push(created);
  }

  ingredients = await fetchPaginated<{ id: string; name: string }>(
    api,
    "/api/admin/ingredients",
  );
  console.log(`  OK ingredientes: ${ingredients.length}.`);

  // 5) Supplies
  console.log("5/16 Importando insumos...");
  const suppliesTable = table("06_insumos.csv");
  let supplies = await fetchPaginated<{ id: string; name: string }>(
    api,
    "/api/admin/supplies",
  );

  for (const row of suppliesTable.rows) {
    const name = getCell(suppliesTable, row, "nombre_insumo", { required: true });
    const categoryName = getCell(suppliesTable, row, "categoria_insumo", { required: true });
    const unitValue = getCell(suppliesTable, row, "unidad_base", { required: true });
    const baseCostPerUnit = parseNumber(suppliesTable, row, "costo_por_unidad", {
      required: true,
    });
    const description = toNullable(getCell(suppliesTable, row, "descripcion"));

    const exists = supplies.find((item) => canonicalize(item.name) === canonicalize(name));
    if (exists) {
      continue;
    }

    const category = findByName(
      categoryName,
      supplyCategories,
      "categoría de insumo",
      `${suppliesTable.fileName}:${row.__line}`,
    );
    const unit = await ensureUnit(
      unitValue,
      `${suppliesTable.fileName}:${row.__line}`,
    );

    const created = await ensureCreate(
      () =>
        api.post<{ id: string; name: string }>("/api/admin/supplies", {
          name,
          description,
          baseUnitId: unit.id,
          categoryId: category.id,
          baseCostPerUnit,
        }),
      async () => findByName(name, supplies, "insumo", "conflicto"),
    );
    supplies.push(created);
  }

  supplies = await fetchPaginated<{ id: string; name: string }>(api, "/api/admin/supplies");
  console.log(`  OK insumos: ${supplies.length}.`);

  // 6) Variation groups + options
  console.log("6/16 Importando grupos de variación y opciones...");
  const variationGroupsTable = table("07_grupos_variacion.csv");
  const variationOptionsTable = table("08_opciones_grupo_variacion.csv");
  let variationGroups = await fetchPaginated<VariationGroup>(
    api,
    "/api/admin/variations/groups",
  );

  const optionsByGroup = new Map<string, CsvRow[]>();
  for (const row of variationOptionsTable.rows) {
    const groupName = getCell(variationOptionsTable, row, "nombre_grupo_variacion", {
      required: true,
    });
    const resolvedGroup = resolveSingle(
      groupName,
      variationGroupsTable.rows.map((value) =>
        getCell(variationGroupsTable, value, "nombre_grupo_variacion", { required: true }),
      ),
      "grupo de variación",
      `${variationOptionsTable.fileName}:${row.__line}`,
      3,
    );
    const currentRows = optionsByGroup.get(resolvedGroup) ?? [];
    currentRows.push(row);
    optionsByGroup.set(resolvedGroup, currentRows);
  }

  const groupRowsSorted = [...variationGroupsTable.rows].sort((left, right) => {
    const leftOrder = parseNumber(variationGroupsTable, left, "orden_grupo") ?? 0;
    const rightOrder = parseNumber(variationGroupsTable, right, "orden_grupo") ?? 0;
    return leftOrder - rightOrder;
  });

  for (const groupRow of groupRowsSorted) {
    const name = getCell(variationGroupsTable, groupRow, "nombre_grupo_variacion", {
      required: true,
    });
    const customerLabel = toNullable(getCell(variationGroupsTable, groupRow, "etiqueta_cliente"));

    const exists = variationGroups.find((group) => canonicalize(group.name) === canonicalize(name));
    if (exists) {
      continue;
    }

    const rawOptions = optionsByGroup.get(name) ?? [];

    if (rawOptions.length === 0) {
      throw new Error(
        `El grupo "${name}" no tiene opciones en ${variationOptionsTable.fileName}.`,
      );
    }

    const optionsPayload = [...rawOptions]
      .sort((left, right) => {
        const leftOrder = parseNumber(variationOptionsTable, left, "orden_opcion") ?? 0;
        const rightOrder = parseNumber(variationOptionsTable, right, "orden_opcion") ?? 0;
        return leftOrder - rightOrder;
      })
      .map((row, index) => ({
        name: getCell(variationOptionsTable, row, "nombre_opcion", { required: true }),
        customerDescription: toNullable(
          getCell(variationOptionsTable, row, "descripcion_cliente"),
        ),
        sortOrder: parseNumber(variationOptionsTable, row, "orden_opcion") ?? index,
      }));

    await ensureCreate(
      () =>
        api.post<VariationGroup>("/api/admin/variations/groups", {
          name,
          customerLabel,
          options: optionsPayload,
        }),
      async () => {
        const refreshed = await fetchPaginated<VariationGroup>(
          api,
          "/api/admin/variations/groups",
        );
        const found = findByName(name, refreshed, "grupo de variación", "conflicto");
        return refreshed.find((item) => item.id === found.id) as VariationGroup;
      },
    );
  }

  variationGroups = await fetchPaginated<VariationGroup>(
    api,
    "/api/admin/variations/groups",
  );
  console.log(`  OK grupos variación: ${variationGroups.length}.`);

  // 7) Modifiers + options + option components
  console.log("7/16 Importando modificadores...");
  const modifiersTable = table("13_modificadores.csv");
  const modifierOptionsTable = table("14_opciones_modificador.csv");
  const modifierOptionComponentsTable = table("15_componentes_opcion_modificador.csv");
  let modifiers = await fetchPaginated<Modifier>(api, "/api/admin/modifiers");

  const modifierOptionsRowsByModifier = new Map<string, CsvRow[]>();
  for (const row of modifierOptionsTable.rows) {
    const modifierName = getCell(modifierOptionsTable, row, "nombre_modificador", { required: true });
    const resolvedModifierName = resolveSingle(
      modifierName,
      modifiersTable.rows.map((entry) =>
        getCell(modifiersTable, entry, "nombre_modificador", { required: true }),
      ),
      "modificador",
      `${modifierOptionsTable.fileName}:${row.__line}`,
      3,
    );

    const values = modifierOptionsRowsByModifier.get(resolvedModifierName) ?? [];
    values.push(row);
    modifierOptionsRowsByModifier.set(resolvedModifierName, values);
  }

  const modifierComponentRowsByModifier = new Map<string, CsvRow[]>();
  for (const row of modifierOptionComponentsTable.rows) {
    const modifierName = getCell(modifierOptionComponentsTable, row, "nombre_modificador", {
      required: true,
    });
    const resolvedModifierName = resolveSingle(
      modifierName,
      modifiersTable.rows.map((entry) =>
        getCell(modifiersTable, entry, "nombre_modificador", { required: true }),
      ),
      "modificador",
      `${modifierOptionComponentsTable.fileName}:${row.__line}`,
      3,
    );

    const values = modifierComponentRowsByModifier.get(resolvedModifierName) ?? [];
    values.push(row);
    modifierComponentRowsByModifier.set(resolvedModifierName, values);
  }

  for (const row of modifiersTable.rows) {
    const name = getCell(modifiersTable, row, "nombre_modificador", { required: true });
    const kitchenName = toNullable(getCell(modifiersTable, row, "nombre_en_cocina"));
    const customerLabel = toNullable(getCell(modifiersTable, row, "etiqueta_cliente"));
    const multiSelect = parseYesNo(modifiersTable, row, "seleccion_multiple", false);
    const minSelect = parseNumber(modifiersTable, row, "minimo_selecciones") ?? 0;
    const maxSelectRaw = getCell(modifiersTable, row, "maximo_selecciones");
    const maxSelect =
      maxSelectRaw.length === 0 ? null : Number(parseNumber(modifiersTable, row, "maximo_selecciones"));

    const exists = modifiers.find((item) => canonicalize(item.name) === canonicalize(name));
    if (exists) {
      continue;
    }

    const optionRows = modifierOptionsRowsByModifier.get(name) ?? [];
    if (optionRows.length === 0) {
      throw new Error(
        `El modificador "${name}" no tiene opciones en ${modifierOptionsTable.fileName}.`,
      );
    }

    const optionRowsSorted = [...optionRows].sort((left, right) => {
      const leftOrder = parseNumber(modifierOptionsTable, left, "orden_opcion") ?? 0;
      const rightOrder = parseNumber(modifierOptionsTable, right, "orden_opcion") ?? 0;
      return leftOrder - rightOrder;
    });

    const componentRows = modifierComponentRowsByModifier.get(name) ?? [];
    const optionNames = optionRowsSorted.map((optionRow) =>
      getCell(modifierOptionsTable, optionRow, "nombre_opcion", {
        required: true,
      }),
    );
    const optionComponentRowsByOption = new Map<string, CsvRow[]>();

    for (const componentRow of componentRows) {
      const componentOptionName = getCell(
        modifierOptionComponentsTable,
        componentRow,
        "nombre_opcion",
        { required: true },
      );
      const resolvedOptionName = resolveSingle(
        componentOptionName,
        optionNames,
        "opción de modificador",
        `${modifierOptionComponentsTable.fileName}:${componentRow.__line}`,
        3,
      );
      const rowsForOption = optionComponentRowsByOption.get(resolvedOptionName) ?? [];
      rowsForOption.push(componentRow);
      optionComponentRowsByOption.set(resolvedOptionName, rowsForOption);
    }

    const optionsPayload = optionRowsSorted.map((optionRow) => {
      const optionName = getCell(modifierOptionsTable, optionRow, "nombre_opcion", {
        required: true,
      });
      const optionKitchenName = toNullable(
        getCell(modifierOptionsTable, optionRow, "nombre_opcion_cocina"),
      );
      const optionCustomerName = toNullable(
        getCell(modifierOptionsTable, optionRow, "nombre_opcion_cliente"),
      );
      const price = parseNumber(modifierOptionsTable, optionRow, "precio_extra_mxn") ?? 0;
      const isDefault = parseYesNo(modifierOptionsTable, optionRow, "opcion_default", false);
      const optionComponentRows = optionComponentRowsByOption.get(optionName) ?? [];

      const ingredientsPayload: Array<{ ingredientId: string; quantity: number }> = [];
      const suppliesPayload: Array<{ supplyId: string; quantity: number }> = [];

      for (const componentRow of optionComponentRows) {
        const componentType = getCell(
          modifierOptionComponentsTable,
          componentRow,
          "tipo_componente",
          { required: true },
        ).toLowerCase();
        const componentName = getCell(
          modifierOptionComponentsTable,
          componentRow,
          "nombre_componente",
          { required: true },
        );
        const quantity = parseNumber(modifierOptionComponentsTable, componentRow, "cantidad", {
          required: true,
        });

        if (!quantity || quantity <= 0) {
          throw new Error(
            `Cantidad inválida en ${modifierOptionComponentsTable.fileName}:${componentRow.__line}`,
          );
        }

        if (componentType === "ingrediente") {
          const ingredient = findByName(
            componentName,
            ingredients,
            "ingrediente",
            `${modifierOptionComponentsTable.fileName}:${componentRow.__line}`,
          );
          ingredientsPayload.push({
            ingredientId: ingredient.id,
            quantity,
          });
          continue;
        }

        if (componentType === "insumo") {
          const supply = findByName(
            componentName,
            supplies,
            "insumo",
            `${modifierOptionComponentsTable.fileName}:${componentRow.__line}`,
          );
          suppliesPayload.push({
            supplyId: supply.id,
            quantity,
          });
          continue;
        }

        throw new Error(
          `tipo_componente inválido "${componentType}" en ${modifierOptionComponentsTable.fileName}:${componentRow.__line}.`,
        );
      }

      return {
        name: optionName,
        kitchenName: optionKitchenName,
        customerName: optionCustomerName,
        price,
        isDefault,
        ingredients: ingredientsPayload,
        supplies: suppliesPayload,
      };
    });

    await ensureCreate(
      () =>
        api.post<Modifier>("/api/admin/modifiers", {
          name,
          kitchenName,
          customerLabel,
          multiSelect,
          minSelect,
          maxSelect,
          options: optionsPayload,
        }),
      async () => {
        const refreshed = await fetchPaginated<Modifier>(api, "/api/admin/modifiers");
        const found = findByName(name, refreshed, "modificador", "conflicto");
        return refreshed.find((item) => item.id === found.id) as Modifier;
      },
    );
  }

  modifiers = await fetchPaginated<Modifier>(api, "/api/admin/modifiers");
  console.log(`  OK modificadores: ${modifiers.length}.`);

  // 8) Products, variation links, variations, selections, recipes, product modifiers
  console.log("8/16 Importando productos (con variaciones, recetas y modificadores)...");
  const productsTable = table("02_productos.csv");
  const productVariationGroupsTable = table("09_producto_grupos_variacion.csv");
  const productVariationsTable = table("10_variaciones_producto.csv");
  const variationSelectionsTable = table("11_selecciones_variacion_producto.csv");
  const productRecipesTable = table("12_recetas_producto.csv");
  const productModifiersTable = table("16_producto_modificadores.csv");

  const productRefResolver = buildProductReferenceResolver(productsTable.rows, productsTable);
  const productNames = productRefResolver.names;

  const variationGroupRowsByProduct = new Map<string, CsvRow[]>();
  for (const row of productVariationGroupsTable.rows) {
    const rawProductName = getCell(productVariationGroupsTable, row, "nombre_producto", {
      required: true,
    });
    const productName = productRefResolver.resolveOne(
      rawProductName,
      `${productVariationGroupsTable.fileName}:${row.__line}`,
    );
    const rows = variationGroupRowsByProduct.get(productName) ?? [];
    rows.push(row);
    variationGroupRowsByProduct.set(productName, rows);
  }

  const variationRowsByProduct = new Map<string, CsvRow[]>();
  for (const row of productVariationsTable.rows) {
    const rawProductName = getCell(productVariationsTable, row, "nombre_producto", {
      required: true,
    });
    const productName = productRefResolver.resolveOne(
      rawProductName,
      `${productVariationsTable.fileName}:${row.__line}`,
    );
    const rows = variationRowsByProduct.get(productName) ?? [];
    rows.push(row);
    variationRowsByProduct.set(productName, rows);
  }

  const selectionRowsByProduct = new Map<string, CsvRow[]>();
  for (const row of variationSelectionsTable.rows) {
    const rawProductName = getCell(variationSelectionsTable, row, "nombre_producto", {
      required: true,
    });
    const productName = productRefResolver.resolveOne(
      rawProductName,
      `${variationSelectionsTable.fileName}:${row.__line}`,
    );
    const rows = selectionRowsByProduct.get(productName) ?? [];
    rows.push(row);
    selectionRowsByProduct.set(productName, rows);
  }

  const recipeRowsByProduct = new Map<string, CsvRow[]>();
  for (const row of productRecipesTable.rows) {
    const rawProductName = getCell(productRecipesTable, row, "nombre_producto", { required: true });
    const productName = productRefResolver.resolveOne(
      rawProductName,
      `${productRecipesTable.fileName}:${row.__line}`,
    );
    const rows = recipeRowsByProduct.get(productName) ?? [];
    rows.push(row);
    recipeRowsByProduct.set(productName, rows);
  }

  const modifierRowsByProduct = new Map<string, CsvRow[]>();
  for (const row of productModifiersTable.rows) {
    const rawProductName = getCell(productModifiersTable, row, "nombre_producto", { required: true });
    const products = productRefResolver.resolveManyForModifier(
      rawProductName,
      `${productModifiersTable.fileName}:${row.__line}`,
    );

    for (const productName of products) {
      const rows = modifierRowsByProduct.get(productName) ?? [];
      rows.push(row);
      modifierRowsByProduct.set(productName, rows);
    }
  }

  const existingProducts = await loadExistingProductsFromDb();
  const importedProductsByName = new Map<string, ProductItem>();

  function buildRecipe(rows: CsvRow[], context: string) {
    if (rows.length === 0) {
      return undefined;
    }

    const description =
      rows
        .map((row) => toNullable(getCell(productRecipesTable, row, "descripcion_receta")))
        .find((value) => value && value.length > 0) ?? null;

    const ingredientsPayload: Array<{ ingredientId: string; quantity: number }> = [];
    const suppliesPayload: Array<{ supplyId: string; quantity: number }> = [];

    for (const row of rows) {
      const componentType = getCell(productRecipesTable, row, "tipo_componente", {
        required: true,
      }).toLowerCase();
      const componentName = getCell(productRecipesTable, row, "nombre_componente", {
        required: true,
      });
      const quantity = parseNumber(productRecipesTable, row, "cantidad", { required: true });

      if (!quantity || quantity <= 0) {
        throw new Error(
          `Cantidad inválida en ${productRecipesTable.fileName}:${row.__line} para ${context}.`,
        );
      }

      if (componentType === "ingrediente") {
        const ingredient = findByName(
          componentName,
          ingredients,
          "ingrediente",
          `${productRecipesTable.fileName}:${row.__line}`,
        );
        ingredientsPayload.push({
          ingredientId: ingredient.id,
          quantity,
        });
        continue;
      }

      if (componentType === "insumo") {
        const supply = findByName(
          componentName,
          supplies,
          "insumo",
          `${productRecipesTable.fileName}:${row.__line}`,
        );
        suppliesPayload.push({
          supplyId: supply.id,
          quantity,
        });
        continue;
      }

      throw new Error(
        `tipo_componente inválido "${componentType}" en ${productRecipesTable.fileName}:${row.__line}.`,
      );
    }

    return {
      description,
      ingredients: ingredientsPayload,
      supplies: suppliesPayload,
    } satisfies RecipePayload;
  }

  for (const productRow of productsTable.rows) {
    const productName = getCell(productsTable, productRow, "nombre_producto", { required: true });
    const imageHint = getOptionalCell(productRow, "archivo_imagen");
    const imagePath = await resolveImagePathForEntity({
      entityName: productName,
      entityLabel: "producto",
      imageHint,
      imagesDir: config.imagesDir,
      csvDir: config.csvDir,
      imageIndex,
      context: `${productsTable.fileName}:${productRow.__line}`,
    });
    const productTypeRaw = getCell(productsTable, productRow, "tipo_producto", { required: true });
    const productType = productTypeRaw.toLowerCase();

    if (!["assembled", "simple", "compound"].includes(productType)) {
      throw new Error(
        `tipo_producto inválido "${productTypeRaw}" en ${productsTable.fileName}:${productRow.__line}.`,
      );
    }

    const existing = existingProducts.find(
      (product) => canonicalize(product.name) === canonicalize(productName),
    );
    if (existing) {
      if (imagePath) {
        console.log(
          `  - Imagen omitida para "${productName}" porque el producto ya existe (solo se carga imagen en creación).`,
        );
      }
      importedProductsByName.set(productName, existing);
      continue;
    }

    const categoryPath = getCell(productsTable, productRow, "ruta_categoria_producto");
    const categoryId = resolveCategoryIdByPath(
      categoryPath,
      productCategoryTree.data,
      `${productsTable.fileName}:${productRow.__line}`,
    );
    const unitValue = getCell(productsTable, productRow, "unidad_venta", { required: true });
    const unit = await ensureUnit(
      unitValue,
      `${productsTable.fileName}:${productRow.__line}`,
    );

    const linkedVariationGroupRows = variationGroupRowsByProduct.get(productName) ?? [];
    const variationGroupIds = [...linkedVariationGroupRows]
      .sort((left, right) => {
        const leftOrder = parseNumber(productVariationGroupsTable, left, "orden_en_producto") ?? 0;
        const rightOrder = parseNumber(productVariationGroupsTable, right, "orden_en_producto") ?? 0;
        return leftOrder - rightOrder;
      })
      .map((row) => {
        const variationGroupName = getCell(
          productVariationGroupsTable,
          row,
          "nombre_grupo_variacion",
          { required: true },
        );
        return findByName(
          variationGroupName,
          variationGroups,
          "grupo de variación",
          `${productVariationGroupsTable.fileName}:${row.__line}`,
        ).id;
      });

    const variationRows = variationRowsByProduct.get(productName) ?? [];
    const selectionRows = selectionRowsByProduct.get(productName) ?? [];
    const recipeRows = recipeRowsByProduct.get(productName) ?? [];

    const variationAliases = variationRows.map((row) =>
      getCell(productVariationsTable, row, "alias_variacion", { required: true }),
    );

    const variationPayloads: VariationPayload[] = variationRows.map((variationRow) => {
      const aliasRaw = getCell(productVariationsTable, variationRow, "alias_variacion", {
        required: true,
      });
      const alias = resolveSingle(
        aliasRaw,
        variationAliases,
        "alias de variación",
        `${productVariationsTable.fileName}:${variationRow.__line}`,
        3,
      );
      const variationPrice = parseNumber(productVariationsTable, variationRow, "precio_mxn", {
        required: true,
      });
      if (variationPrice === undefined) {
        throw new Error(
          `precio_mxn requerido para variación "${alias}" (${productVariationsTable.fileName}:${variationRow.__line}).`,
        );
      }

      const relatedSelectionRows = selectionRows.filter((selectionRow) => {
        const aliasSelection = getCell(
          variationSelectionsTable,
          selectionRow,
          "alias_variacion",
          { required: true },
        );
        const resolvedAlias = resolveSingle(
          aliasSelection,
          variationAliases,
          "alias de variación",
          `${variationSelectionsTable.fileName}:${selectionRow.__line}`,
          3,
        );
        return canonicalize(resolvedAlias) === canonicalize(alias);
      });

      const selectionsPayload = relatedSelectionRows.map((selectionRow) => {
        const variationGroupName = getCell(
          variationSelectionsTable,
          selectionRow,
          "nombre_grupo_variacion",
          { required: true },
        );
        const variationGroup = findByName(
          variationGroupName,
          variationGroups,
          "grupo de variación",
          `${variationSelectionsTable.fileName}:${selectionRow.__line}`,
        ) as VariationGroup;
        const optionName = getCell(variationSelectionsTable, selectionRow, "nombre_opcion", {
          required: true,
        });
        const option = findByName(
          optionName,
          variationGroup.options as Array<{ id: string; name: string }>,
          "opción de variación",
          `${variationSelectionsTable.fileName}:${selectionRow.__line}`,
        ) as VariationOption;

        return {
          variationGroupId: variationGroup.id,
          variationOptionId: option.id,
        };
      });

      const variationRecipeRows = recipeRows.filter((recipeRow) => {
        const level = getCell(productRecipesTable, recipeRow, "nivel_receta", { required: true }).toLowerCase();
        if (level !== "variacion" && level !== "variación") {
          return false;
        }

        const recipeAliasRaw = getCell(productRecipesTable, recipeRow, "alias_variacion");
        if (recipeAliasRaw.length === 0) {
          return false;
        }

        const resolvedAlias = resolveSingle(
          recipeAliasRaw,
          variationAliases,
          "alias de variación",
          `${productRecipesTable.fileName}:${recipeRow.__line}`,
          3,
        );

        return canonicalize(resolvedAlias) === canonicalize(alias);
      });

      const variationRecipe = buildRecipe(
        variationRecipeRows,
        `variación ${alias} del producto ${productName}`,
      );

      return {
        price: variationPrice,
        kitchenName: toNullable(getCell(productVariationsTable, variationRow, "nombre_en_cocina")),
        customerDescription: toNullable(
          getCell(productVariationsTable, variationRow, "descripcion_cliente"),
        ),
        kitchenDescription: toNullable(
          getCell(productVariationsTable, variationRow, "descripcion_cocina"),
        ),
        selections: selectionsPayload,
        ...(variationRecipe ? { recipe: variationRecipe } : {}),
      };
    });

    const productRecipeRows = recipeRows.filter((recipeRow) => {
      const level = getCell(productRecipesTable, recipeRow, "nivel_receta", { required: true }).toLowerCase();
      return level === "producto";
    });
    const baseRecipe = buildRecipe(
      productRecipeRows,
      `producto ${productName}`,
    );

    const modifierLinkRows = modifierRowsByProduct.get(productName) ?? [];
    const modifierIds = [...modifierLinkRows]
      .sort((left, right) => {
        const leftOrder = parseNumber(productModifiersTable, left, "orden_en_producto") ?? 0;
        const rightOrder = parseNumber(productModifiersTable, right, "orden_en_producto") ?? 0;
        return leftOrder - rightOrder;
      })
      .map((modifierRow) => {
        const modifierName = getCell(productModifiersTable, modifierRow, "nombre_modificador", {
          required: true,
        });
        return findByName(
          modifierName,
          modifiers,
          "modificador",
          `${productModifiersTable.fileName}:${modifierRow.__line}`,
        ).id;
      });

    const price = parseNumber(productsTable, productRow, "precio_mxn");
    const finalPrice = variationPayloads.length > 0 ? undefined : price;
    const finalRecipe =
      variationPayloads.length > 0 ? undefined : baseRecipe;
    const imageUploadId = imagePath
      ? await uploadImageAsset({
          api,
          imagePath,
          cache: uploadedImageIdByPath,
        })
      : null;

    const payload = {
      name: productName,
      kitchenName: toNullable(getCell(productsTable, productRow, "nombre_en_cocina")),
      ...(finalPrice !== undefined ? { price: finalPrice } : {}),
      customerDescription: getCell(productsTable, productRow, "descripcion_cliente") || "",
      kitchenDescription: toNullable(getCell(productsTable, productRow, "descripcion_cocina")),
      unitId: unit.id,
      categoryId,
      imageUploadId,
      taxIds: [ivaTax.id],
      organizationIds,
      ...(modifierIds.length > 0 ? { modifierIds } : {}),
      ...(variationGroupIds.length > 0 ? { variationGroupIds } : {}),
      ...(variationPayloads.length > 0 ? { variations: variationPayloads } : {}),
      ...(finalRecipe ? { recipe: finalRecipe } : {}),
      productType,
    };

    const created = await ensureCreate(
      () => api.post<{ id: string; name: string }>("/api/admin/products", payload),
      async () => findByName(productName, existingProducts, "producto", "conflicto"),
    );

    if (imagePath && imageUploadId) {
      console.log(`  + Imagen asignada a "${productName}" (${path.basename(imagePath)}).`);
    }

    importedProductsByName.set(productName, created);
    existingProducts.push(created);
  }

  console.log(`  OK productos procesados: ${productNames.length}.`);

  console.log("------------------------------------------");
  console.log("Importación completada.");
  console.log("Orden ejecutado:");
  console.log("1) Categorías producto");
  console.log("2) Categorías ingrediente");
  console.log("3) Categorías insumo");
  console.log("4) Ingredientes");
  console.log("5) Insumos");
  console.log("6) Grupos de variación + opciones");
  console.log("7) Modificadores + opciones + componentes");
  console.log("8) Productos + grupos + variaciones + selecciones + recetas + producto-modificadores");
}

main().catch((error) => {
  if (error instanceof HttpError) {
    console.error("Error HTTP:", error.message);
    console.error("Status:", error.status);
    console.error("Payload:", JSON.stringify(error.payload, null, 2));
    process.exit(1);
  }

  console.error("Error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
