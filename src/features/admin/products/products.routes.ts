import type { FastifyInstance } from "fastify";
import { createRoutes } from "./create";

export async function adminProductsRoutes(server: FastifyInstance) {
  await server.register(createRoutes);
}
