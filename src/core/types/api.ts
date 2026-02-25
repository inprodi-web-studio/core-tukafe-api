export type RequestHeaders = Record<string, string | string[] | undefined>;

export interface BetterAuthError {
  status: string;
  body: {
    code: string;
    message: string;
  };
  statusCode: number;
}
