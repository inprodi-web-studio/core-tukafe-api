import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";

const authStatements = {
  ...defaultStatements,
  customers: ["create", "read", "update", "delete"],
  customerGroups: ["create", "read", "update", "delete"],
} as const;

export const ac = createAccessControl(authStatements);

const authRoles = {
  admin: ac.newRole({
    user: defaultStatements.user,
    session: defaultStatements.session,
    customers: ["create", "read", "update", "delete"],
    customerGroups: ["create", "read", "update", "delete"],
  }),
  member: ac.newRole({
    customers: ["read", "update"],
    customerGroups: ["read"],
  }),
  customer: ac.newRole({
    customers: [],
  }),
};

export const AUTH_STATEMENTS = authStatements;
export const AUTH_ROLES = authRoles;
