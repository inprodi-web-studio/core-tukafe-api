import type { FastifyInstance } from "fastify";
import { freeDrinkProgressRoutes } from "./freeDrinkProgress";

export async function customerRewardsRoutes(server: FastifyInstance) {
  await server.register(freeDrinkProgressRoutes);
}
