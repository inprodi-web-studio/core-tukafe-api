import type { FastifyInstance } from "fastify";
import { listRoutes } from "./list";
import { nearestRoutes } from "./nearest";

export async function customerOrganizationsRoutes(server: FastifyInstance) {
  await server.register(nearestRoutes);
  await server.register(listRoutes);
}
