import type { FastifyInstance } from "fastify";
import { createRoutes } from "./create";

export async function adminIngredientsRoutes(server: FastifyInstance) {
  await server.register(createRoutes);
}
