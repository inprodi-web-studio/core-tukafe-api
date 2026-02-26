import { HttpError } from "./errors";

type ErrorMappingPath = readonly [string, ...string[]];

type ErrorFactory = Error | ((error: unknown) => Error);

export interface ThrowMappedErrorOptions {
  map: Record<string, ErrorFactory>;
  codePaths?: readonly ErrorMappingPath[];
  resolveCode?: (error: unknown) => string | undefined;
  passthrough?: (error: unknown) => boolean;
  fallback?: (error: unknown) => unknown;
}

const DEFAULT_CODE_PATHS: readonly ErrorMappingPath[] = [
  ["code"],
  ["body", "code"],
  ["error", "code"],
];

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getByPath(source: unknown, path: readonly string[]): unknown {
  let current: unknown = source;

  for (const key of path) {
    if (!isObjectRecord(current)) {
      return undefined;
    }

    current = current[key];
  }

  return current;
}

function resolveCodeByPaths(
  error: unknown,
  paths: readonly ErrorMappingPath[] = DEFAULT_CODE_PATHS,
): string | undefined {
  for (const path of paths) {
    const value = getByPath(error, path);

    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

export function throwMappedError(error: unknown, options: ThrowMappedErrorOptions): never {
  const shouldPassthrough = options.passthrough ?? isHttpError;

  if (shouldPassthrough(error)) {
    throw error;
  }

  const code =
    options.resolveCode?.(error) ??
    resolveCodeByPaths(error, options.codePaths ?? DEFAULT_CODE_PATHS);

  if (code) {
    const mappedError = options.map[code];

    if (mappedError) {
      throw (typeof mappedError === "function" ? mappedError(error) : mappedError);
    }
  }

  if (options.fallback) {
    throw options.fallback(error);
  }

  throw error;
}
