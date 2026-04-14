import { listOrganizations } from "@features/shared/organizations";
import type { FastifyInstance } from "fastify";
import type { GuestOrganizationsService } from "./organizations.types";

export function guestOrganizationsService(fastify: FastifyInstance): GuestOrganizationsService {
  return {
    async list() {
      return listOrganizations(fastify);
    },
  };
}
