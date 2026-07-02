import type { FastifyInstance } from "fastify";
import { findOrCreateRoutes } from "./findOrCreate";
import { identifyWithQrRoutes } from "./identifyWithQr";

export async function guestCustomersRoutes(server: FastifyInstance) {
  await server.register(findOrCreateRoutes);
  await server.register(identifyWithQrRoutes);
}
