import type { FastifyInstance } from "fastify";
import { completeRoutes } from "./complete";
import { listRoutes } from "./list";
import { socketRoutes } from "./socket";

export async function adminWorkOrdersRoutes(server: FastifyInstance) {
  await server.register(listRoutes);
  await server.register(completeRoutes);
  await server.register(socketRoutes);
}
