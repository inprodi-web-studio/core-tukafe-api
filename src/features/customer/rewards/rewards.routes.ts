import type { FastifyInstance } from "fastify";
import { cashbackRoutes } from "./cashback";
import { freeDrinkProgressRoutes } from "./freeDrinkProgress";

export async function customerRewardsRoutes(server: FastifyInstance) {
  await server.register(freeDrinkProgressRoutes);
  await server.register(cashbackRoutes);
}
