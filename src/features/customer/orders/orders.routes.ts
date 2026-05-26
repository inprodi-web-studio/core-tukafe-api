import type { FastifyInstance } from "fastify";
import { createRoutes } from "./create";
import { previewRoutes } from "./preview";

export async function customerOrdersRoutes(server: FastifyInstance) {
  await server.register(previewRoutes, { prefix: "/preview" });
  await server.register(createRoutes);
}
