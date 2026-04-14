import { asc } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { OrganizationSummary } from "./organizations.types";

export async function listOrganizations(fastify: FastifyInstance): Promise<OrganizationSummary[]> {
  const organizations = await fastify.db.query.organizationDB.findMany({
    where(table, { isNull }) {
      return isNull(table.deletedAt);
    },
    columns: {
      id: true,
      name: true,
      slug: true,
      address: true,
    },
    orderBy(table, { asc: ascOperator }) {
      return [ascOperator(table.name), asc(table.slug)];
    },
  });

  return organizations;
}
