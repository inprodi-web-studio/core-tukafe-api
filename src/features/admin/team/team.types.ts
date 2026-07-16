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
  organizationIds: string[];
  createdAt: Date;
}

export interface CreateTeamMemberResult extends TeamMemberListItem {
  existingUser: boolean;
  credentialCreated: boolean;
}

export interface TeamListParams {
  viewerUserId: string;
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

export interface UpdateTeamMemberParams {
  editorUserId: string;
  activeOrganizationId: string;
  memberId: string;
  organizationIds: string[];
  name: string;
  surnames: string;
  role: TeamRole;
}

export interface AdminTeamService {
  list(input: TeamListParams): Promise<PaginatedResult<TeamMemberListItem>>;
  create(input: CreateTeamMemberParams): Promise<CreateTeamMemberResult>;
  update(input: UpdateTeamMemberParams): Promise<TeamMemberListItem>;
}
