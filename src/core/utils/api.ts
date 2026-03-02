const NANOID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-";

export interface PgError {
  code: string;
  constraint?: string;
}

export function generateNanoId(size = 21): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size));

  let id = "";

  for (const byte of bytes) {
    id += NANOID_ALPHABET[byte & 63] ?? NANOID_ALPHABET[0];
  }

  return id;
}

export function isPgError(error: unknown): error is PgError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[0-9A-Z]{5}$/.test(error.code)
  );
}

export function getPgError(error: unknown): PgError | null {
  if (isPgError(error)) {
    return error;
  }

  if (typeof error === "object" && error !== null && "cause" in error) {
    return getPgError(error.cause);
  }

  return null;
}
