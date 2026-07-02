import type { OrganizationSummary } from "@features/shared/organizations";

export interface UpdateOrganizationLocationParams {
  organizationId: string;
  activeOrganizationId: string;
  latitude: number;
  longitude: number;
}

export interface AdminOrganizationsService {
  updateLocation(input: UpdateOrganizationLocationParams): Promise<OrganizationSummary>;
}
