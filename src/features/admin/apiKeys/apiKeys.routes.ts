import type { FastifyInstance } from "fastify";
import { createRoutes } from "./create";

export async function adminApiKeysRoutes(server: FastifyInstance) {
  await server.register(createRoutes);
}
