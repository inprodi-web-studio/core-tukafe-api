import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements as organizationDefaultStatements } from "better-auth/plugins/organization/access";

const organizationStatements = {
  ...organizationDefaultStatements,
  schedules: ["create", "read", "update", "delete"],
} as const;

export const ORGANIZATION_AC = createAccessControl(organizationStatements);

export const ORGANIZATION_ROLES = {
  owner: ORGANIZATION_AC.newRole({
    organization: ["update", "delete"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
    schedules: ["create", "read", "update", "delete"],
  }),
  admin: ORGANIZATION_AC.newRole({
    organization: ["update"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
    schedules: ["create", "read", "update", "delete"],
  }),
  member: ORGANIZATION_AC.newRole({
    invitation: ["create"],
    schedules: ["read"],
  }),
};
