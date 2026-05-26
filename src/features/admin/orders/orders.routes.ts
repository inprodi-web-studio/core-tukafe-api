import type { FastifyInstance } from "fastify";
import { createRoutes } from "./create";
import { paymentAttemptsRoutes } from "./paymentAttempts";

export async function adminOrdersRoutes(server: FastifyInstance) {
  await server.register(paymentAttemptsRoutes);
  await server.register(createRoutes);
}
