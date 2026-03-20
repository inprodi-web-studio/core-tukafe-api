import type { FastifyInstance } from "fastify";
import { createRoutes } from "./create";

export async function customerOrdersRoutes(server: FastifyInstance) {
  await server.register(createRoutes);
}
