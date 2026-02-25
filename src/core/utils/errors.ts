export type ErrorType =
  | "BadRequest"
  | "NotFound"
  | "Forbidden"
  | "Conflict"
  | "InternalError"
  | "Validation"
  | "Unauthorized";

export interface AppError {
  code: string;
  type: ErrorType;
  message: string;
  data?: Record<string, unknown>;
}

export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly type: ErrorType;
  public readonly data?: Record<string, unknown>;

  constructor(
    statusCode: number,
    code: string,
    type: ErrorType,
    message: string,
    data?: Record<string, unknown>,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.type = type;
    this.data = data;
    this.name = "HttpError";
  }

  toJSON(): AppError {
    return {
      code: this.code,
      type: this.type,
      message: this.message,
      ...(this.data && { data: this.data }),
    };
  }
}

export function badRequest(
  code: string,
  message: string,
  data?: Record<string, unknown>,
): HttpError {
  return new HttpError(400, code, "BadRequest", message, data);
}

export function notFound(code: string, message: string, data?: Record<string, unknown>): HttpError {
  return new HttpError(404, code, "NotFound", message, data);
}

export function forbidden(
  code: string,
  message: string,
  data?: Record<string, unknown>,
): HttpError {
  return new HttpError(403, code, "Forbidden", message, data);
}

export function unauthorized(
  code: string,
  message: string,
  data?: Record<string, unknown>,
): HttpError {
  return new HttpError(401, code, "Unauthorized", message, data);
}

export function conflict(code: string, message: string, data?: Record<string, unknown>): HttpError {
  return new HttpError(409, code, "Conflict", message, data);
}

export function validation(
  code: string,
  message: string,
  data?: Record<string, unknown>,
): HttpError {
  return new HttpError(422, code, "Validation", message, data);
}

export function internalError(
  code: string,
  message: string,
  data?: Record<string, unknown>,
): HttpError {
  return new HttpError(500, code, "InternalError", message, data);
}
