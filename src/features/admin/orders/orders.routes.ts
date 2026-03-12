import type { FastifyInstance } from "fastify";
import { createRoutes } from "./create";

export async function adminOrdersRoutes(server: FastifyInstance) {
  await server.register(createRoutes);
}
