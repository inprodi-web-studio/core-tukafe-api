import type { FastifyInstance } from "fastify";
import { createRoutes } from "./create";
import { paymentAttemptsRoutes } from "./paymentAttempts";
import { previewRoutes } from "./preview";

export async function guestOrdersRoutes(server: FastifyInstance) {
  await server.register(previewRoutes, { prefix: "/preview" });
  await server.register(paymentAttemptsRoutes);
  await server.register(createRoutes);
}
