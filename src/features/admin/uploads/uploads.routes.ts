import type { FastifyInstance } from "fastify";

import { createRoutes } from "./create";

export async function adminUploadsRoutes(server: FastifyInstance) {
  await server.register(createRoutes);
}
