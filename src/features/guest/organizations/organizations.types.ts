import type { OrganizationSummary } from "@features/shared/organizations";

export interface GuestOrganizationsService {
  list(): Promise<OrganizationSummary[]>;
}
