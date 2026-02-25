import type { User } from "@core/db/schemas";
import type { RequestHeaders } from "@core/types";

export interface AdminAuthService {
  loginWithEmail(
    input: LoginWithEmailServiceParams,
    requestHeaders?: RequestHeaders,
  ): Promise<LoginWithEmailServiceResponse>;
}

export interface LoginWithEmailServiceParams {
  email: string;
  password: string;
}

export interface LoginWithEmailServiceResponse {
  user: Pick<User, "id" | "email" | "name" | "middleName" | "lastName">;
  cookie: string | null;
}
