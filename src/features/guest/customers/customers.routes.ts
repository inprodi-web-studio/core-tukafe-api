import type { FastifyInstance } from "fastify";
import { findOrCreateRoutes } from "./findOrCreate";

export async function guestCustomersRoutes(server: FastifyInstance) {
  await server.register(findOrCreateRoutes);
}
