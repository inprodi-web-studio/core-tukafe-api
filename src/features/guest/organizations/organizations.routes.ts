import type { FastifyInstance } from "fastify";
import { listRoutes } from "./list";

export async function guestOrganizationsRoutes(server: FastifyInstance) {
  await server.register(listRoutes);
}
