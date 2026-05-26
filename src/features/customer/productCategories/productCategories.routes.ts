import type { FastifyInstance } from "fastify";
import { listRoutes } from "./list";

export async function customerProductCategoriesRoutes(server: FastifyInstance) {
  await server.register(listRoutes);
}
