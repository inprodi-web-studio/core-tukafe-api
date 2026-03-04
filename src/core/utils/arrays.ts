import { validation } from "./errors";

export function assertUniqueValues<T>(
  values: readonly T[],
  code: string,
  message: string,
): void {
  if (new Set(values).size !== values.length) {
    throw validation(code, message);
  }
}
