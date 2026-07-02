import { organizationDB } from "@core/db/schemas";
import { and, asc, isNotNull, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { NearestOrganizationResult, OrganizationSummary } from "./organizations.types";

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
      latitude: true,
      longitude: true,
    },
    orderBy(table, { asc: ascOperator }) {
      return [ascOperator(table.name), asc(table.slug)];
    },
  });

  return organizations;
}

export async function findNearestOrganization(
  fastify: FastifyInstance,
  input: { latitude: number; longitude: number },
): Promise<NearestOrganizationResult> {
  const distanceMeters = sql<number>`
    6371000 * 2 * asin(
      least(
        1,
        sqrt(
          power(sin(radians((${organizationDB.latitude} - ${input.latitude}) / 2)), 2)
          +
          cos(radians(${input.latitude}))
          * cos(radians(${organizationDB.latitude}))
          * power(sin(radians((${organizationDB.longitude} - ${input.longitude}) / 2)), 2)
        )
      )
    )
  `;

  const [nearestOrganization] = await fastify.db
    .select({
      id: organizationDB.id,
      name: organizationDB.name,
      slug: organizationDB.slug,
      address: organizationDB.address,
      latitude: organizationDB.latitude,
      longitude: organizationDB.longitude,
      distanceMeters,
    })
    .from(organizationDB)
    .where(
      and(
        isNull(organizationDB.deletedAt),
        isNotNull(organizationDB.latitude),
        isNotNull(organizationDB.longitude),
      ),
    )
    .orderBy(distanceMeters, asc(organizationDB.name), asc(organizationDB.id))
    .limit(1);

  if (!nearestOrganization) {
    return {
      organization: null,
      distanceMeters: null,
    };
  }

  const { distanceMeters: distance, ...organization } = nearestOrganization;

  return {
    organization,
    distanceMeters: Number(distance),
  };
}
