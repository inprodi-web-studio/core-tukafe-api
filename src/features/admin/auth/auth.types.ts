import type { User } from "@core/db/schemas";
import type { RequestHeaders } from "@core/types";

export type PortalOrganizationRole = "owner" | "admin";

export interface PortalOrganization {
  id: string;
  name: string;
  slug: string;
  role: PortalOrganizationRole;
}

export interface PortalSession {
  user: Pick<User, "id" | "email" | "name" | "middleName" | "lastName">;
  activeOrganization: PortalOrganization;
  organizations: PortalOrganization[];
}

export interface AdminAuthService {
  loginWithEmail(
    input: LoginWithEmailServiceParams,
    requestHeaders?: RequestHeaders,
  ): Promise<LoginWithEmailServiceResponse>;
  loginToPortal(
    input: PortalLoginServiceParams,
    requestHeaders?: RequestHeaders,
  ): Promise<PortalSessionMutationResponse>;
  getPortalSession(requestHeaders?: RequestHeaders): Promise<PortalSession>;
  setPortalActiveOrganization(
    input: SetPortalActiveOrganizationParams,
    requestHeaders?: RequestHeaders,
  ): Promise<PortalSessionMutationResponse>;
}

export interface LoginWithEmailServiceParams {
  email: string;
  password: string;
  organizationId?: string | null;
}

export interface LoginWithEmailServiceResponse {
  user: Pick<User, "id" | "email" | "name" | "middleName" | "lastName">;
  cookie: string | null;
  organizationId: string | null;
}

export interface PortalLoginServiceParams {
  email: string;
  password: string;
}

export interface SetPortalActiveOrganizationParams {
  organizationId: string;
}

export interface PortalSessionMutationResponse {
  session: PortalSession;
  cookie: string | null;
}
