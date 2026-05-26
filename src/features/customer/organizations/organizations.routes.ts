import type { FastifyInstance } from "fastify";
import { listRoutes } from "./list";

export async function customerOrganizationsRoutes(server: FastifyInstance) {
  await server.register(listRoutes);
}
