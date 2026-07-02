export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
}

export interface NearestOrganizationResult {
  organization: OrganizationSummary | null;
  distanceMeters: number | null;
}
