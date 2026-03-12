import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements as organizationDefaultStatements } from "better-auth/plugins/organization/access";

const organizationStatements = {
  ...organizationDefaultStatements,
  schedules: ["create", "read", "update", "delete"],
  products: ["create", "read", "update", "archive", "unarchive", "delete"],
  productCategories: ["create", "read", "update", "delete"],
  variationGroups: ["create", "read", "update", "delete"],
  modifiers: ["create", "read", "update", "delete"],
  ingredients: ["create", "read", "update", "delete"],
  supplies: ["create", "read", "update", "delete"],
  suppliers: ["create", "read", "update", "delete"],
  ingredientCategories: ["create", "read", "update", "delete"],
  supplyCategories: ["create", "read", "update", "delete"],
  taxes: ["create", "read", "update", "delete"],
  units: ["create", "read", "update", "delete"],
  orders: ["create", "read", "update", "delete"],
} as const;

export const ORGANIZATION_AC = createAccessControl(organizationStatements);

type OrganizationStatements = typeof ORGANIZATION_AC.statements;

export type OrganizationPermissions = {
  [K in keyof OrganizationStatements]?: OrganizationStatements[K][number][];
};

export const ORGANIZATION_ROLES = {
  owner: ORGANIZATION_AC.newRole({
    organization: ["update", "delete"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
    schedules: ["create", "read", "update", "delete"],
    products: ["create", "read", "update", "archive", "unarchive", "delete"],
    productCategories: ["create", "read", "update", "delete"],
    variationGroups: ["create", "read", "update", "delete"],
    modifiers: ["create", "read", "update", "delete"],
    ingredients: ["create", "read", "update", "delete"],
    supplies: ["create", "read", "update", "delete"],
    suppliers: ["create", "read", "update", "delete"],
    ingredientCategories: ["create", "read", "update", "delete"],
    supplyCategories: ["create", "read", "update", "delete"],
    taxes: ["create", "read", "update", "delete"],
    units: ["create", "read", "update", "delete"],
    orders: ["create", "read", "update", "delete"],
  }),
  admin: ORGANIZATION_AC.newRole({
    organization: ["update"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
    schedules: ["create", "read", "update", "delete"],
    products: ["create", "read", "update", "archive", "unarchive", "delete"],
    productCategories: ["read"],
    variationGroups: ["read"],
    modifiers: ["read"],
    ingredients: ["read"],
    supplies: ["read"],
    suppliers: ["read"],
    ingredientCategories: ["read"],
    supplyCategories: ["read"],
    taxes: ["read"],
    units: ["read"],
    orders: ["create", "read", "update", "delete"],
  }),
  member: ORGANIZATION_AC.newRole({
    invitation: ["create"],
    schedules: ["read"],
    products: ["read"],
    productCategories: ["read"],
    variationGroups: ["read"],
    modifiers: ["read"],
    ingredients: ["read"],
    supplies: ["read"],
    suppliers: ["read"],
    ingredientCategories: ["read"],
    supplyCategories: ["read"],
    taxes: ["read"],
    units: ["read"],
    orders: ["create", "read"],
  }),
};
