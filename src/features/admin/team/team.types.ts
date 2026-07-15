import type { PaginatedResult } from "@core/utils";

export type TeamRole = "admin" | "barista";
export type TeamSortField = "name" | "email" | "role" | "createdAt";
export type TeamSortDirection = "asc" | "desc";

export interface TeamMemberListItem {
  id: string;
  name: string;
  surnames: string;
  email: string;
  role: TeamRole;
  createdAt: Date;
}

export interface TeamListParams {
  organizationId: string;
  page: number;
  pageSize: number;
  search?: string | null;
  role?: TeamRole;
  sortBy: TeamSortField;
  sortDirection: TeamSortDirection;
}

export interface CreateTeamMemberParams {
  creatorUserId: string;
  organizationIds: string[];
  name: string;
  surnames: string;
  email: string;
  password: string;
  role: TeamRole;
}

export interface AdminTeamService {
  list(input: TeamListParams): Promise<PaginatedResult<TeamMemberListItem>>;
  create(input: CreateTeamMemberParams): Promise<TeamMemberListItem>;
}
