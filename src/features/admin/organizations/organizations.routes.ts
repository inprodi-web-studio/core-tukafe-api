import type { FastifyInstance } from "fastify";
import { updateLocationRoutes } from "./updateLocation";

export async function adminOrganizationsRoutes(server: FastifyInstance) {
  await server.register(updateLocationRoutes);
}
