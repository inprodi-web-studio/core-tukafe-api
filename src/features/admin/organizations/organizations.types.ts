import type { OrganizationSummary } from "@features/shared/organizations";
import type { PaginatedResult } from "@core/utils";

export type OrganizationStatus = "active" | "inactive";

export interface OrganizationListItem extends OrganizationSummary {
  logo: string | null;
  status: OrganizationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListOrganizationsParams {
  page: number;
  pageSize: number;
  search?: string | null;
  status: "all" | OrganizationStatus;
}

export interface CreateOrganizationParams {
  creatorUserId: string;
  name: string;
  slug: string;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  logoUploadId?: string | null;
}

export interface UpdateOrganizationParams {
  organizationId: string;
  name?: string;
  slug?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  logoUploadId?: string | null;
}

export interface DeactivateOrganizationParams {
  organizationId: string;
  actorUserId: string;
  activeOrganizationId: string;
}

export interface UpdateOrganizationLocationParams {
  organizationId: string;
  activeOrganizationId: string;
  latitude: number;
  longitude: number;
}

export interface AdminOrganizationsService {
  list(input: ListOrganizationsParams): Promise<PaginatedResult<OrganizationListItem>>;
  create(input: CreateOrganizationParams): Promise<OrganizationListItem>;
  update(input: UpdateOrganizationParams): Promise<OrganizationListItem>;
  deactivate(input: DeactivateOrganizationParams): Promise<void>;
  restore(organizationId: string): Promise<OrganizationListItem>;
  updateLocation(input: UpdateOrganizationLocationParams): Promise<OrganizationSummary>;
}
