import { organizationDB } from "@core/db/schemas";
import { forbidden, notFound } from "@core/utils";
import { and, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { AdminOrganizationsService } from "./organizations.types";

export function adminOrganizationsService(fastify: FastifyInstance): AdminOrganizationsService {
  return {
    async updateLocation({ organizationId, activeOrganizationId, latitude, longitude }) {
      if (organizationId !== activeOrganizationId) {
        throw forbidden(
          "organization.activeOrganizationMismatch",
          "Only the active organization can be updated",
        );
      }

      const [updatedOrganization] = await fastify.db
        .update(organizationDB)
        .set({
          latitude,
          longitude,
          updatedAt: new Date(),
        })
        .where(and(eq(organizationDB.id, organizationId), isNull(organizationDB.deletedAt)))
        .returning({
          id: organizationDB.id,
          name: organizationDB.name,
          slug: organizationDB.slug,
          address: organizationDB.address,
          latitude: organizationDB.latitude,
          longitude: organizationDB.longitude,
        });

      if (!updatedOrganization) {
        throw notFound("organization.notFound", "The organization was not found");
      }

      return updatedOrganization;
    },
  };
}
